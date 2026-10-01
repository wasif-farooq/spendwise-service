#!/usr/bin/env python3
"""
Records the adapter test fixtures (tests/fixtures/connections/<adapter>/) from
the keyless public endpoints, trimmed to the fields the adapters read.

    python3 scripts/connections/record-fixtures.py

Bitcoin: mempool.space, address 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy (sends + receives)
Tron:    TronGrid, address TYr4DLeAY4S7g9FkQQGvo8DmyPDvzb8HWq (TRX transfers, fees)
Solana:  public RPC, address E16prLnWTwfLUYgXRTELYgw4u8QUnN9CAcHceLrDTjN1 (fee payer, failed txs)
EVM has no keyless API: its fixtures are hand-written to the Etherscan V2 shapes.
"""
import json, os, time, urllib.request

UA = 'TrackMyPocket/1.0 (+https://trackmypocket.com)'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'fixtures', 'connections')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=30))


def rpc(method, params):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode()
    req = urllib.request.Request('https://api.mainnet-beta.solana.com', data=body,
                                 headers={'User-Agent': UA, 'Content-Type': 'application/json'})
    time.sleep(0.6)
    return json.load(urllib.request.urlopen(req, timeout=30))


def save(adapter, name, data):
    path = os.path.join(ROOT, adapter, name)
    with open(path, 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print('wrote', os.path.relpath(path))


def trim_btc(tx):
    return {
        'txid': tx['txid'], 'fee': tx['fee'],
        'status': {k: tx['status'].get(k) for k in ('confirmed', 'block_time')},
        'vin': [{'prevout': ({'scriptpubkey_address': v['prevout'].get('scriptpubkey_address'),
                              'value': v['prevout']['value']} if v.get('prevout') else None)} for v in tx['vin']],
        'vout': [{'scriptpubkey_address': v.get('scriptpubkey_address'), 'value': v['value']} for v in tx['vout']],
    }


def bitcoin():
    a = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
    info = get(f'https://mempool.space/api/address/{a}')
    save('bitcoin', 'address.json', {'address': a, 'chain_stats': info['chain_stats']})
    page1 = get(f'https://mempool.space/api/address/{a}/txs/chain')
    save('bitcoin', 'txs-page1.json', [trim_btc(t) for t in page1])
    page2 = get(f'https://mempool.space/api/address/{a}/txs/chain/{page1[-1]["txid"]}')
    save('bitcoin', 'txs-page2.json', [trim_btc(t) for t in page2])


def tron():
    a = 'TYr4DLeAY4S7g9FkQQGvo8DmyPDvzb8HWq'
    acct = get(f'https://api.trongrid.io/v1/accounts/{a}')
    d = acct['data'][0] if acct.get('data') else {}
    save('tron', 'account.json', {'data': [{'address': d.get('address'), 'balance': d.get('balance', 0),
                                            'trc20': d.get('trc20', [])}], 'success': True})
    txs = get(f'https://api.trongrid.io/v1/accounts/{a}/transactions?limit=50&only_confirmed=true')
    keep = ('txID', 'block_timestamp', 'ret', 'raw_data', 'internal_tx_id', 'net_fee', 'energy_fee')
    for t in txs['data']:
        if 'raw_data' in t:
            t['raw_data'] = {'contract': [{'type': c['type'], 'parameter': {'value': {
                k: v for k, v in c['parameter']['value'].items() if k in ('amount', 'owner_address', 'to_address', 'contract_address')}}}
                for c in t['raw_data']['contract']]}
    save('tron', 'transactions.json', {'data': [{k: v for k, v in t.items() if k in keep} for t in txs['data']],
                                       'success': True, 'meta': {}})
    usdt = get(f'https://api.trongrid.io/v1/accounts/{a}/transactions/trc20?limit=50&only_confirmed=true'
               '&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
    save('tron', 'trc20-usdt.json', {'data': usdt['data'], 'success': True, 'meta': {}})


def solana():
    a = 'E16prLnWTwfLUYgXRTELYgw4u8QUnN9CAcHceLrDTjN1'
    save('solana', 'getBalance.json', rpc('getBalance', [a]))
    save('solana', 'getTokenAccountsByOwner.json', rpc('getTokenAccountsByOwner', [
        a, {'programId': 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'}, {'encoding': 'jsonParsed'}]))
    sigs = rpc('getSignaturesForAddress', [a, {'limit': 25}])
    for s in sigs['result']:
        s.pop('memo', None)
    save('solana', 'getSignaturesForAddress.json', sigs)
    txs = {}
    for s in sigs['result']:
        tx = rpc('getTransaction', [s['signature'], {'encoding': 'jsonParsed', 'maxSupportedTransactionVersion': 0}])['result']
        m = tx['meta']
        txs[s['signature']] = {
            'blockTime': tx['blockTime'],
            'meta': {k: m.get(k) for k in ('fee', 'err', 'preBalances', 'postBalances', 'preTokenBalances', 'postTokenBalances')},
            'transaction': {'message': {'accountKeys': [{'pubkey': k['pubkey'], 'signer': k['signer']}
                                                        for k in tx['transaction']['message']['accountKeys']]}},
        }
    save('solana', 'getTransaction.json', txs)


if __name__ == '__main__':
    bitcoin()
    tron()
    solana()

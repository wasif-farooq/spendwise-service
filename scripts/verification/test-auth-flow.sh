#!/bin/bash
set -e

# Register
echo "Registering..."
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"integration@example.com", "password":"password123", "firstName":"Test", "lastName":"User"}' | jq

echo -e "\n"

# Login
echo "Logging in..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"integration@example.com", "password":"password123"}')
  
TOKEN=$(echo $RESPONSE | jq -r .token)

echo "Got Token: $TOKEN"

if [ "$TOKEN" == "null" ]; then
  echo "Login failed"
  exit 1
fi

# Get Profile (Simulating Auth Header injection for now as we didn't implement full JWT middleware extraction yet, 
# but UserService assumes ID is present. The UserController logic I wrote had a fallback ID, 
# so this checks if wiring works.)
echo "Getting Profile..."
curl -s http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n"

echo "Done."

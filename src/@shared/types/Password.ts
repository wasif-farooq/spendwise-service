import bcrypt from 'bcrypt';

export class Password {
    private constructor(private readonly hashedValue: string) { }

    public static async create(plainText: string): Promise<Password> {
        if (plainText.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(plainText, salt);
        return new Password(hash);
    }

    public static fromHash(hash: string): Password {
        return new Password(hash);
    }

    public async compare(plainText: string): Promise<boolean> {
        return bcrypt.compare(plainText, this.hashedValue);
    }

    get hash(): string {
        return this.hashedValue;
    }
}

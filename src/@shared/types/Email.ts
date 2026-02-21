export class Email {
  private constructor(private readonly value: string) {}

  public static create(email: string): Email {
    if (!this.validate(email)) {
      throw new Error('Invalid email address');
    }
    return new Email(email);
  }

  private static validate(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  get raw(): string {
    return this.value;
  }
}

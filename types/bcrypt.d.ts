declare module 'bcrypt' {
  const bcrypt: {
    compare(data: string, hash: string): Promise<boolean>;
    hash(data: string, saltRounds: number): Promise<string>;
  };
  export default bcrypt;
}


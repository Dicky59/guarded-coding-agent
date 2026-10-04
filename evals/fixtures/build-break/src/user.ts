export interface User {
  id: number;
  name: string; // renamed from `fullName` in the 2.0 release
  email?: string;
  roles: string[];
}

export function findUser(users: User[], id: number): User | undefined {
  return users.find((u) => u.id === id);
}

export function primaryRole(user: User): string | undefined {
  return user.roles[0];
}

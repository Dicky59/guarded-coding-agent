export function createUserRepository() {
  const users = new Map();
  return {
    save(user) {
      users.set(user.id, user);
      return user;
    },
    byEmail: (email) => [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
    count: () => users.size,
  };
}

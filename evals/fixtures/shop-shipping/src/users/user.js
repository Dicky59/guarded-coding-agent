import { assertNonEmpty } from "../utils/validate.js";
import { newId } from "../utils/ids.js";

export function createUser({ name, email, address }) {
  return {
    id: newId("usr"),
    name: assertNonEmpty(name, "name"),
    email: assertNonEmpty(email, "email").toLowerCase(),
    address: { country: assertNonEmpty(address.country, "country").toUpperCase(), city: address.city ?? "" },
  };
}

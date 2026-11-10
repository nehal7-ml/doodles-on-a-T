import type { User } from "../generated/prisma/client";

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    image: user.image,
  };
}

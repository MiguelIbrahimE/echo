import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@common/db";
import { users } from "@schema";
import { env } from "@common/env";
import { LoginDTO, SignupDTO } from "./auth.schema";

class AuthService {
  async signup(dto: SignupDTO) {
    const hash = bcrypt.hashSync(dto.password, 10);
    const [user] = await db
      .insert(users)
      .values({ email: dto.email, hash })
      .returning();
    return this.toJWT(user.id);
  }

  async login(dto: LoginDTO) {
    const user = await db
      .select()
      .from(users)
      .where({ email: dto.email })
      .then((r) => r[0]);
    if (!user || !bcrypt.compareSync(dto.password, user.hash))
      throw { status: 401, message: "Invalid credentials" };
    return this.toJWT(user.id);
  }

  private toJWT(id: string) {
    return jwt.sign({ sub: id }, env.JWT_SECRET, { expiresIn: "7d" });
  }
}

export const authService = new AuthService();

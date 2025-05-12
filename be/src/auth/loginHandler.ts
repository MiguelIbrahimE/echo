import { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { exec } from "child_process"; // Import the exec function to run the Python script

const pool = new Pool();

export const loginHandler: RequestHandler = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    try {
        // 1) Check user in DB
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [username]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        // 2) Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid username or password." });
        }

        // 3) Generate JWT
        const token = jwt.sign(
            { id: user.id, username: user.email },
            process.env.JWT_SECRET!,
            { expiresIn: "1h" }
        );

        // 5) Send success response with token
        res.status(200).json({ token, username: user.email });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Server error. Please try again." });
    }
};
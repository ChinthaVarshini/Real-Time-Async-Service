import jwt from "jsonwebtoken";
import { config } from "dotenv";
config();

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// Get user details from command line arguments or use defaults
const userId = process.argv[2] || "user";
const userName = process.argv[3] || "System User";
const expiresIn = process.argv[4] || "24h";

const token = jwt.sign(
  { 
    sub: userId, 
    name: userName,
    iat: Math.floor(Date.now() / 1000)
  },
  JWT_SECRET,
  { expiresIn }
);

console.log("🔑 JWT Token Generated:");
console.log("=======================");
console.log(token);
console.log("");
console.log("📋 Token Details:");
console.log(`   User ID: ${userId}`);
console.log(`   Name: ${userName}`);
console.log(`   Expires: ${expiresIn}`);
console.log("");
console.log("🌐 Dashboard URLs:");
console.log("   Gateway: http://localhost:4005");
console.log("   Real Gateway: http://localhost:4005");
console.log("");
console.log("📋 Copy this token and paste it in the dashboard connection field");
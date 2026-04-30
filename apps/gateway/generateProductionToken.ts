import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "dotenv";
config();

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// Get user details from command line arguments or use defaults
const userId = process.argv[2] || "prod-user";
const userName = process.argv[3] || "Production User";
const expiresIn = process.argv[4] || "7d";

const token = jwt.sign(
  { 
    sub: userId, 
    name: userName,
    role: "admin",
    permissions: ["email:send", "file:upload", "dashboard:access"],
    iat: Math.floor(Date.now() / 1000)
  },
  JWT_SECRET,
  { expiresIn } as SignOptions
);

console.log("🔑 Production JWT Token:");
console.log("========================");
console.log(token);
console.log("");
console.log("📋 Token Details:");
console.log(`   User ID: ${userId}`);
console.log(`   Name: ${userName}`);
console.log(`   Expires: ${expiresIn}`);
console.log(`   Role: admin`);
console.log("");
console.log("🌐 Dashboard URLs:");
console.log("   Gateway: http://localhost:4005");
console.log("   Real Gateway: http://localhost:4005");
console.log("");
console.log("📋 Usage:");
console.log("   Copy the token above and paste it in the dashboard connection field");
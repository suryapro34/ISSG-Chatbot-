const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate this user's RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let registeredUsername = "";
let username = "";
const users = new Map();

function signMessage(message) {
  return crypto
    .sign("sha256", Buffer.from(message), privateKey)
    .toString("base64");
}

function verifyMessage(message, signature, pubKey) {
  try {
    return crypto.verify(
      "sha256",
      Buffer.from(message),
      pubKey,
      Buffer.from(signature, "base64")
    );
  } catch (err) {
    return false; 
  }
}

let started = false;

function startChat() {
  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", { username, publicKey });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        let match;
        if ((match = message.match(/^!impersonate (\w+)$/))) {
          username = match[1];
          console.log(`Now impersonating as ${username}`);
        } else if (message.match(/^!exit$/)) {
          username = registeredUsername;
          console.log(`Now you are ${username}`);
        } else {
          const signature = signMessage(message);
          socket.emit("message", { username, message, signature });
        }
      }
      rl.prompt();
    });
  });
}

socket.on("connect", () => {
  console.log("Connected to the server");
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`There are currently ${users.size} users in the chat`);

  if (!started) {
    started = true;
    startChat();
  }
});

socket.on("newUser", (data) => {
  const { username: newName, publicKey: newKey } = data;
  users.set(newName, newKey);
  if (registeredUsername) {
    console.log(`${newName} joined the chat`);
    rl.prompt();
  }
});

socket.on("message", (data) => {
  const { username: sender, message, signature } = data;


  if (verifyMessage(message, signature, publicKey)) return;


  const senderKey = users.get(sender);
  if (senderKey && verifyMessage(message, signature, senderKey)) {
    console.log(`${sender}: ${message}`);
  } else {
    console.log(`${sender}: ${message}`);
    console.log("⚠️  WARNING: this user is fake");
  }
  rl.prompt();
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
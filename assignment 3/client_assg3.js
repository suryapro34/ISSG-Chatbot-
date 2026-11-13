const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});


const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let targetUsername = "";
let username = "";
let started = false;
const users = new Map();

function encryptFor(pubKey, plaintext) {
  return crypto
    .publicEncrypt(
      {
        key: pubKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(plaintext)
    )
    .toString("base64");
}

function tryDecrypt(ciphertext) {
  try {
    return crypto
      .privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(ciphertext, "base64")
      )
      .toString();
  } catch (err) {
    return null; 
  }
}

function startChat() {
  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", { username, publicKey });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        let match;
        if ((match = message.match(/^!secret (\w+)$/))) {
          const target = match[1];
          if (!users.has(target)) {
            console.log(`User ${target} not found`);
          } else if (target === username) {
            console.log("You can't secretly chat with yourself");
          } else {
            targetUsername = target;
            console.log(`Now secretly chatting with ${targetUsername}`);
          }
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else if (targetUsername) {
          if (Buffer.byteLength(message) > 190) {
            console.log("Message too long for RSA (max 190 bytes)");
          } else {
            const encrypted = encryptFor(users.get(targetUsername), message);
            socket.emit("message", { username, message: encrypted });
          }
        } else {
          socket.emit("message", { username, message });
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
  if (started && username) {
    console.log(`${newName} joined the chat`);
    rl.prompt();
  }
});

socket.on("message", (data) => {
  const { username: sender, message } = data;
  if (sender === username) return;

  const plaintext = tryDecrypt(message);
  if (plaintext !== null) {
    console.log(`${sender} (secret): ${plaintext}`);
  } else {
    console.log(`${sender}: ${message}`); 
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
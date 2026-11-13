const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let username = "";

function hashMessage(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);
  });
});


rl.on("line", (message) => {
  if (username && message.trim()) {
    const hash = hashMessage(message);
    socket.emit("message", { username, message, hash });
  }
});


socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage, hash } = data;
  if (senderUsername === username) return;

  if (hashMessage(senderMessage) === hash) {
    console.log(`${senderUsername}: ${senderMessage}`);
  } else {
    console.log(`${senderUsername}: ${senderMessage}`);
    console.log("⚠️  WARNING: the message may have been changed during transmission");
  }
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
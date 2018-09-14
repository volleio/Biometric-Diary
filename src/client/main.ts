// TypingDNA singleton
const typingDNA = new TypingDNA();

// Set up login input tracking
typingDNA.addTarget("login-input");

// Transition from loading to login screen
const mainSpinner = document.getElementById("main-spinner");
mainSpinner.style.opacity = "0";
mainSpinner.style.transform = "scale(0)";

const mainContainer = document.getElementById("main-container");
mainContainer.style.opacity = "1";

const loginInput = document.getElementById("login-input");
loginInput.focus();

// Switch to note input tracking

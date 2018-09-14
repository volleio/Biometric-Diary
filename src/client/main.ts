// TypingDNA singleton
const typingDNA = new TypingDNA();

// Set up login input tracking
typingDNA.addTarget("login-input");

// Transition from loading to login screen
const mainSpinner = document.getElementById("main-spinner");
const spinnerAnimationState = getComputedStyle(mainSpinner)["animationPlayState"];
if (spinnerAnimationState === "running")
{
	mainSpinner.style.animationPlayState = "paused";
	mainSpinner.style.opacity = "0";
}
else
	mainSpinner.style.animation = "fade-out .75s var(--ease-in-out-cubic) forwards";

const mainContainer = document.getElementById("main-container");
mainContainer.style.opacity = "1";

// Switch to note input tracking

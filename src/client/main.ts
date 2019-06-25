class BiometricDiaryClient {
	private mainContainer: HTMLElement;
	private typingDna: any;

	// Login Help
	private loginHelpSpinner = document.querySelector('.login-help-spinner') as HTMLElement;
	private currentHelpTextState: HelpStates = null;
	private isLoginHelpPrimary = true;
	private loginContainer = document.querySelector('.login-container') as HTMLElement;
	private loginHelp = this.loginContainer.querySelector('.login-help') as HTMLElement;
	private loginHelpText1 = this.loginContainer.querySelector('.login-help-text__1') as HTMLElement;
	private loginHelpText2 = this.loginContainer.querySelector('.login-help-text__2') as HTMLElement;
	private loginHelpExtra = this.loginContainer.querySelector('.login-help-extra') as HTMLElement;

	private loginButton = this.loginContainer.querySelector('.login-button') as HTMLElement;
	private loginInput = document.getElementById('login-input') as HTMLInputElement;
	private loginAuthBadge = this.loginContainer.querySelector('.login-auth-badge') as HTMLElement;
	
	private loginId = '';

	private authMatchProgressRing.partialRotation: ProgressRing;
	private authUpdateProgressRing: ProgressRing;

	private notesContainer = document.querySelector('.notes-container') as HTMLElement;
	private firstNoteInput = document.getElementById('note-input') as HTMLTextAreaElement;
	
	private onFirstNoteKeyDown: (evt: KeyboardEvent) => void;

	private keysPressed = 0; // Just for stats
	private keysPressedSinceQualityUpdate = 0;
	private currentPatternQuality = 0;
	private keysPressedSinceMatchUpdate = 0;

	private static QUALITY_UPDATE_MINIMUM_KEYPRESSES = 10;
	private static MATCH_UPDATE_MAXIMUM_KEYPRESSES = 50;
	private static MATCH_UPDATE_MINIMUM_QUALITY = 0.5;

	private notesToSave: { [key: string]: HTMLTextAreaElement };

	constructor() 
	{
		this.Initialize();
	}

	private Initialize()
	{
		// TypingDNA singleton
		this.typingDna = new TypingDNA();

		// Display warning on Mobile devices
		if (this.typingDna.isMobile())
		{
			const mobileWarning = document.querySelector('.mobile-warning') as HTMLElement;
			mobileWarning.style.display = 'flex';

			const mobileWarningText = mobileWarning.querySelector('.mobile-warning__body');
			mobileWarningText.innerHTML = LANG_DICT.Other.MobileWarningText;

			const popupClose = mobileWarning.querySelector('.popup-close') as HTMLButtonElement;
			popupClose.addEventListener('click', () => mobileWarning.style.display = 'none');
		}

		// Set up login input tracking
		this.typingDna.addTarget('login-input');

		this.loginInput.addEventListener('keydown', (evt) => 
		{
			requestAnimationFrame(() => 
			{
				if (this.loginInput.value === '') 
					this.typingDna.reset();

				if (this.currentHelpTextState === HelpStates.CreateAccount)
				{
					if (this.loginInput.value === this.loginId)
						this.CreateAccount();
					
					return;
				}

				if (this.loginInput.value.length <= 8) 
				{
					this.UpdateLoginHelp(false, false, HelpStates.EnterEmail, 
						LANG_DICT.Login.EnterEmail,	LANG_DICT.Login.EnterEmailExtra);
					const loginHelpCurrent = this.isLoginHelpPrimary ? this.loginHelpText1 : this.loginHelpText2;
					loginHelpCurrent.style.opacity = (1 - this.loginInput.value.length / 12).toString();
				} 
				else
				{
					this.UpdateLoginHelp(false, true, HelpStates.Login, LANG_DICT.Login.LoginButton);
				}
			});
		});

		this.loginInput.addEventListener('keydown', (evt) => { if (evt.key === 'Enter') this.SubmitLogin(); });
		this.loginButton.addEventListener('click', () => this.SubmitLogin());

		// Transition from loading to login screen
		const mainSpinner = document.getElementById('main-spinner');
		mainSpinner.style.opacity = '0';
		mainSpinner.style.transform = 'scale(0)';

		this.mainContainer = document.getElementById('main-container');
		this.mainContainer.style.opacity = '1';

		this.loginInput.focus();

		// Prompt the user to enter their email
		this.UpdateLoginHelp(false, false, HelpStates.Login, 
			LANG_DICT.Login.EnterEmail, LANG_DICT.Login.EnterEmailExtra);

		this.loginHelpText1.addEventListener('mouseover', () => this.OnLoginHelpMouseOver());
		this.loginHelpText1.addEventListener('mouseout', () => this.OnLoginHelpMouseOut());
		this.loginHelpText2.addEventListener('mouseover', () => this.OnLoginHelpMouseOver());
		this.loginHelpText2.addEventListener('mouseout', () => this.OnLoginHelpMouseOut());
	}

	private async SubmitLogin(): Promise<void>
	{
		this.UpdateLoginHelp(true, true, null, '');
		const loginValue = this.loginInput.value;
		this.loginInput.setAttribute('disabled', '');
		this.loginButton.setAttribute('disabled', '');

		const typingPattern: String = this.typingDna.getTypingPattern({
			type: 1,
			text: loginValue
		});
		this.typingDna.reset();
		
		let loginResult;
		try
		{
			loginResult = await (await fetch('/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					loginId: loginValue,
					typingPattern: typingPattern
				})
			})).json();
		}
		catch(err)
		{
			console.error(err);
			loginResult = { authenticationStatus: AuthenticationStatus.error };
		}

		switch(loginResult.authenticationStatus)
		{
			case AuthenticationStatus.success:
				this.OnLoginSuccess();
				break;

			case AuthenticationStatus.userNotFound:
				this.OnUserNotFound(loginValue);
				break;

			case AuthenticationStatus.failure:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, LANG_DICT.Login.FailedLogin);
				break;

			case AuthenticationStatus.error:
			default:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, LANG_DICT.Login.ErrorLogin);
				break;
		}
	}

	private OnUserNotFound(loginId: string): void
	{
		const userNotFoundElements = document.createElement('div');
		userNotFoundElements.className = 'login-help-with-button';
		userNotFoundElements.innerText = LANG_DICT.Login.UserNotFound;
		
		const userNotFoundButtonContainer = document.createElement('div');
		userNotFoundButtonContainer.className = 'login-help-buttons';
		userNotFoundElements.appendChild(userNotFoundButtonContainer);

		const createAccountButton = document.createElement('button');
		createAccountButton.className = 'primary-button';
		createAccountButton.innerText = LANG_DICT.Login.CreateAccount;
		createAccountButton.addEventListener('click', (evt) => {
			this.loginId = loginId;

			this.loginInput.removeAttribute('disabled');
			this.loginInput.focus();
			this.loginInput.value = '';
			this.UpdateLoginHelp(true, false, HelpStates.CreateAccount, LANG_DICT.Login.RetypeLogin(loginId));
		});
		
		const cancelButton = document.createElement('button');
		cancelButton.className = 'secondary-button';
		cancelButton.innerText = LANG_DICT.Login.CancelLogin;
		cancelButton.addEventListener('click', (evt) => {
			this.loginInput.removeAttribute('disabled');
			this.loginInput.focus();
			this.loginInput.value = '';
			this.UpdateLoginHelp(false, false, HelpStates.EnterEmail, LANG_DICT.Login.EnterEmail);
		});

		userNotFoundButtonContainer.appendChild(createAccountButton);
		userNotFoundButtonContainer.appendChild(cancelButton);

		this.UpdateLoginHelp(false, false, HelpStates.UserNotFound, userNotFoundElements);
	}

	private async CreateAccount(): Promise<void>
	{
		this.UpdateLoginHelp(true, true, null, '');
		const loginValue = this.loginInput.value;
		this.loginInput.setAttribute('disabled', '');
		this.loginButton.setAttribute('disabled', '');

		const typingPattern: String = this.typingDna.getTypingPattern({
			type: 1,
			text: loginValue
		});
		this.typingDna.reset();

		let createAccountResult;
		try
		{
			createAccountResult = await (await fetch('/create-account', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					typingPattern: typingPattern
				})
			})).json();
		}
		catch(err)
		{
			console.error(err);
			createAccountResult = { authenticationStatus: AuthenticationStatus.error };
		}

		switch (createAccountResult.authenticationStatus)
		{
			case AuthenticationStatus.success:
				this.OnLoginSuccess();
				break;

			case AuthenticationStatus.failure:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, LANG_DICT.Login.FailedLogin);			
				break;

			case AuthenticationStatus.error:
			default:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.ErrorLogin, LANG_DICT.Login.ErrorLogin);
				break;
		}
	}

	private UpdateLoginHelp(showSpinner: boolean, showButton: boolean, helpTextState: HelpStates,
		help: string | HTMLElement, extraHelpText?: string): void
	{
		if (showSpinner) 
			this.loginHelpSpinner.style.display = 'block';
		else 
			this.loginHelpSpinner.style.display = '';

		let loginHelpCurrent: HTMLElement;
		let loginHelpHidden: HTMLElement;
		if (this.isLoginHelpPrimary)
		{
			loginHelpCurrent = this.loginHelpText1;
			loginHelpHidden = this.loginHelpText2;
		}
		else
		{
			loginHelpCurrent = this.loginHelpText2;
			loginHelpHidden = this.loginHelpText1;
		}

		loginHelpCurrent.style.opacity = '0';
		loginHelpCurrent.style.pointerEvents = 'none';
		loginHelpHidden.style.opacity = '1';
		loginHelpHidden.style.pointerEvents = 'all';

		if (showButton) 
		{
			this.loginButton.style.opacity = '1';
			this.loginButton.style.pointerEvents = 'all';
			this.loginHelp.style.pointerEvents = 'none';
			loginHelpHidden.style.pointerEvents = 'none';
		}
		else
		{
			this.loginButton.style.opacity = '0';
			this.loginButton.style.pointerEvents = 'none';
			this.loginHelp.style.pointerEvents = 'all';
		}

		if (typeof help === 'string')
		{
			loginHelpHidden.innerHTML = help;
		}
		else
		{
			loginHelpHidden.innerHTML = '';
			loginHelpHidden.appendChild(help);
		}

		if (extraHelpText)
		{
			const extraHelpQuestionMark = document.createElement('span');
			extraHelpQuestionMark.className = 'login-help-extra-question-mark';
			extraHelpQuestionMark.innerHTML = LANG_DICT.Login.ExtraHelpQuestionMark;
			loginHelpHidden.appendChild(extraHelpQuestionMark);

			this.loginHelpExtra.innerHTML = extraHelpText;
		}
		else
		{
			this.loginHelpExtra.innerHTML = '';
		}

		this.currentHelpTextState = helpTextState;
		this.isLoginHelpPrimary = !this.isLoginHelpPrimary;
	}

	private OnLoginHelpMouseOver(): void 
	{		
		this.loginHelpExtra.style.display = 'block';
		const loginHelpHeight = this.isLoginHelpPrimary ? this.loginHelpText1.offsetHeight : this.loginHelpText2.offsetHeight;
		this.loginHelpExtra.style.marginTop = `${loginHelpHeight + 8}px`;
		this.loginHelpExtra.style.opacity = '1';
	}

	private OnLoginHelpMouseOut(): void 
	{
		this.loginHelpExtra.style.opacity = '0';
	}

	private OnLoginSuccess(): void
	{
		this.UpdateLoginHelp(false, false, null, '');
		this.loginHelp.style.display = 'none';
		this.loginButton.style.display = 'none';
		this.loginContainer.classList.add('login-container--logged-in');
		this.loginInput.classList.add('login-input--logged-in');
		
		this.loginAuthBadge.style.display = 'block';
		const loginAuthBadgeCheck = this.loginAuthBadge.querySelector('.login-auth-badge__check') as HTMLElement;
		loginAuthBadgeCheck.classList.add('animate-in');

		// Set up auth badge progress rings
		const authUpdateProgressRingCircle = this.loginAuthBadge.querySelector('.auth-update-progress-ring > .progress-ring__circle') as SVGCircleElement;
		this.authUpdateProgressRing = new ProgressRing(authUpdateProgressRingCircle);
		const authMatchProgressRingCircle = this.loginAuthBadge.querySelector('.auth-match-progress-ring > .progress-ring__circle') as SVGCircleElement;
		this.authMatchProgressRing.partialRotation = new ProgressRing(authMatchProgressRingCircle);

		// Set up main menu
		const mainMenu = this.loginContainer.querySelector(".main-menu") as HTMLElement;
		mainMenu.style.display = 'flex';
		requestAnimationFrame(() => mainMenu.style.opacity = '1');
		
		this.loginContainer.addEventListener('mouseenter', () =>
		{
			this.loginContainer.style.height = this.loginContainer.scrollHeight + 'px';
		});
		
		this.loginContainer.addEventListener('mouseleave', () =>
		{
			this.loginContainer.style.height = '';
		});
		
		const logoutButton = mainMenu.querySelector(".logout-button") as HTMLElement;
		logoutButton.innerHTML = LANG_DICT.MainMenu.Logout;
		logoutButton.addEventListener('click', async () =>
		{
			await fetch('/logout');
			location.reload();
		});
		
		// Switch to note input tracking
		this.notesContainer.classList.add('notes-container--visible');
		this.typingDna.removeTarget('login-input');
		this.typingDna.reset();
		this.typingDna.addTarget('note-input');
		
		this.onFirstNoteKeyDown = (evt) => { requestAnimationFrame(() => this.OnFirstNoteValueUpdate()); };
		this.firstNoteInput.addEventListener('keydown', this.onFirstNoteKeyDown);
	}

	private OnFirstNoteValueUpdate(): void
	{
		this.keysPressed++;
		this.keysPressedSinceQualityUpdate++;
		this.keysPressedSinceMatchUpdate++;

		this.UpdateAuthUpdateProgressRing();

		/**
		 * Before checking a typing pattern against TypingDNA's API, the typing pattern must meet a minimum 
		 * typing pattern quality, or must exceed the maximum number of keypresses for a single match update.
		 */

		// Check typing quality every few (~10) characters
		if (this.keysPressedSinceQualityUpdate >= BiometricDiaryClient.QUALITY_UPDATE_MINIMUM_KEYPRESSES)
		{
			this.keysPressedSinceQualityUpdate = 0;

			const typingPattern: String = this.typingDna.getTypingPattern({
				type: 2,
				text: this.firstNoteInput.value
			});

			if (typingPattern == null)
				return;

			/** 
			 * TODO: this call is always returning 0. Debugging TypingDNA's getQuality function suggests that the 
			 * issue is with the API, because it's calling Number() on each typingPattern string separated by commas, 
			 * which is returning NaN when it reaches each '|' character
			 */
			this.currentPatternQuality = this.typingDna.getQuality(typingPattern);

			// Check against API once the quality (~0.5) or character threshold (~50) has been met
			if (this.currentPatternQuality >= BiometricDiaryClient.MATCH_UPDATE_MINIMUM_QUALITY ||
				this.keysPressedSinceMatchUpdate >= BiometricDiaryClient.MATCH_UPDATE_MAXIMUM_KEYPRESSES)
			{
				this.currentPatternQuality = 0;
				this.keysPressedSinceMatchUpdate = 0;

				// Reset auth update progress
				this.authUpdateProgressRing.SetProgress(0);
				this.authUpdateProgressRing.RotateRing();

				// Send typing pattern to server
				this.SubmitFirstNoteTypingPattern();
			}
		}
	}

	private async SubmitFirstNoteTypingPattern()
	{
		const firstNoteValue = this.firstNoteInput.value;

		const typingPattern: String = this.typingDna.getTypingPattern({
			type: 2,
			text: firstNoteValue
		});
		
		let firstNoteMatchResult;
		try
		{
			firstNoteMatchResult = await (await fetch('/authenticate-note', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					noteContents: firstNoteValue,
					typingPattern: typingPattern,
				})
			})).json();
		}
		catch(err)
		{
			console.error(err);
			firstNoteMatchResult = { authenticationStatus: AuthenticationStatus.error };
		}

		console.log(firstNoteMatchResult);

		const authProgress = firstNoteMatchResult.authenticationProgress;
		this.authMatchProgressRing.partialRotation.SetProgress(authProgress);
		
		/**
		 * When we've successfully fully authenticated the user by matching their anytext typing pattern,
		 * we swap the auth typing event listener out for an event listener that auto saves the note, and
		 * set up the rest of the user's notes
		 */
		if (firstNoteMatchResult.authenticationStatus = AuthenticationStatus.success)
		{
			this.firstNoteInput.removeEventListener('keydown', this.onFirstNoteKeyDown);
			this.SetupNoteToSave(firstNoteMatchResult.noteId, this.firstNoteInput);	
			
			this.RequestUserNotes();
		}
	}

	private SetupNoteToSave(noteId: string, textArea: HTMLTextAreaElement)
	{
		this.firstNoteInput.addEventListener('keydown', (evt) => { 
			requestAnimationFrame(() => this.OnAnyNoteValueUpdate(noteId, textArea)); 
		});
		
	}

	private OnAnyNoteValueUpdate(noteId: string, textArea: HTMLTextAreaElement): void
	{
		this.notesToSave[noteId] = textArea;
	}

	private RequestUserNotes(): void
	{

	}

	private UpdateAuthUpdateProgressRing(): void
	{
		/** 
		 * While half of auth update progress is current pattern quality and half is the distance to the max keypresses,
		 * the progress should appear to "ease-out", or have diminishing returns
		 */
		const qualityProgress = this.currentPatternQuality / BiometricDiaryClient.MATCH_UPDATE_MINIMUM_QUALITY;
		const maxKeypressProgress = this.keysPressedSinceMatchUpdate / BiometricDiaryClient.MATCH_UPDATE_MAXIMUM_KEYPRESSES;
		let progress = (qualityProgress + maxKeypressProgress) / 2;

		// asymptotic function y = -20^(-x) + 1
		progress = 1 - Math.pow(20, -(progress));

		// Auth Update ring only takes up the space remaining inside the Auth Match ring
		this.authUpdateProgressRing.RotateRing(this.authMatchProgressRing.partialRotation);


		this.authUpdateProgressRing.SetProgress(progress);
	}
}

/**
 * Original implementation by jeremenichelli.io @ https://css-tricks.com/building-progress-ring-quickly/
 */
class ProgressRing
{
	public progressRing: SVGCircleElement;
	private circumference: number;
	private fullRotations = 0;
	private partialRotation = 0;
	
	constructor(progressRing: SVGCircleElement)
	{
		this.progressRing = progressRing;
		const radius = this.progressRing.r.baseVal.value;
		this.circumference = radius * 2 * Math.PI;
		
		this.progressRing.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
		this.progressRing.style.strokeDashoffset = `${this.circumference}`;
	}

	/**
	 * Updates the progress ring's progress.
	 * @param progress a number between 0 and 1
	 */
	public SetProgress(progress: number): void
	{
		const offset = this.circumference - progress * this.circumference;
		this.progressRing.style.strokeDashoffset = offset.toString();
	}

	public RotateRing(degrees?: number): void
	{
		if (degrees == null)
			this.fullRotations ++;
		else
			this.partialRotation = degrees;
			
		this.progressRing.parentElement.style.transform = `rotate(${this.fullRotations * 360 + this.partialRotation}deg)`;
	}
}

enum HelpStates {
	EnterEmail,
	Login,
	UserNotFound,
	CreateAccount,
	FailedLogin,
	ErrorLogin,
}

enum AuthenticationStatus {
	success,
	userNotFound,
	accountCreated,
	accountNotCreated,
	failure,
	error
}

const biometricDiary = new BiometricDiaryClient();
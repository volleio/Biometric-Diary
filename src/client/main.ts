class BiometricDiary {
	private mainContainer: HTMLElement;
	private typingDna: any;

	// Login Help
	private loginHelpSpinner = document.querySelector('.login-help-spinner') as HTMLElement;
	private currentHelpTextState: HelpTextStates = null;
	private isLoginHelpPrimary = true;
	private loginHelp = document.querySelector('.login-help') as HTMLElement;
	private loginHelpText1 = document.querySelector('.login-help-text__1') as HTMLElement;
	private loginHelpText2 = document.querySelector('.login-help-text__2') as HTMLElement;
	private loginHelpExtra = document.querySelector('.login-help-extra') as HTMLElement;

	private loginButton = document.querySelector('.login-button') as HTMLElement;
	private loginInput = document.getElementById('login-input') as HTMLInputElement;

	constructor() 
	{
		this.initialize();
	}

	private initialize()
	{
		// TypingDNA singleton
		this.typingDna = new TypingDNA();

		// Set up login input tracking
		this.typingDna.addTarget('login-input');

		this.loginInput.addEventListener('keydown', (evt) => 
		{
			requestAnimationFrame(() => 
			{
				if (this.loginInput.value === '') this.typingDna.reset();

				if (this.loginInput.value.length <= 8) 
				{
					this.updateLoginHelp(false, false, HelpTextStates.EnterEmail, 
						LANG_DICT.Login.EnterEmail,	LANG_DICT.Login.EnterEmailExtra);
					const loginHelpCurrent = this.isLoginHelpPrimary ? this.loginHelpText1 : this.loginHelpText2;
					loginHelpCurrent.style.opacity = (1 - this.loginInput.value.length / 12).toString();
				} 
				else
				{
					this.updateLoginHelp(false, true, HelpTextStates.Login, LANG_DICT.Login.LoginButton);
				}
			});
		});

		this.loginInput.addEventListener('keydown', (evt) => { if (evt.key === 'Enter') this.submitLogin(); });
		this.loginButton.addEventListener('click', () => this.submitLogin());

		// Transition from loading to login screen
		const mainSpinner = document.getElementById('main-spinner');
		mainSpinner.style.opacity = '0';
		mainSpinner.style.transform = 'scale(0)';

		this.mainContainer = document.getElementById('main-container');
		this.mainContainer.style.opacity = '1';

		this.loginInput.focus();

		// Prompt the user to enter their email
		this.updateLoginHelp(false, false, HelpTextStates.Login, 
			LANG_DICT.Login.EnterEmail, LANG_DICT.Login.EnterEmailExtra);

		// Set login extra help text show/hide listeners on help text 2 becuase it will always be on top
		this.loginHelpText2.addEventListener('mouseover', () => this.onLoginHelpMouseOver());
		this.loginHelpText2.addEventListener('mouseout', () => this.onLoginHelpMouseOut());

		// Switch to note input tracking
	}

	private submitLogin()
	{
		this.updateLoginHelp(true, true, null, "");
		const loginValue = this.loginInput.value;
		this.loginInput.setAttribute("disabled", "");
		this.loginButton.setAttribute("disabled", "");

		const typingPattern: String = this.typingDna.getTypingPattern({
			type: 1,
			text: loginValue
		});
		this.typingDna.reset();
		alert('Login Submitted: ' + typingPattern);
	}

	private updateLoginHelp(showSpinner: boolean, showButton: boolean, helpTextState: HelpTextStates,
		text: string, extraHelpText?: string) 
	{
		if (showSpinner) 
			this.loginHelpSpinner.style.display = 'block';
		else 
			this.loginHelpSpinner.style.display = '';

		if (showButton) 
		{
			this.loginButton.style.opacity = '1';
			this.loginButton.style.pointerEvents = 'all';
			this.loginHelp.style.pointerEvents = 'none';
		}
		else
		{
			this.loginButton.style.opacity = '0';
			this.loginButton.style.pointerEvents = 'none';
			this.loginHelp.style.pointerEvents = 'all';
		}

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
		loginHelpHidden.style.opacity = '1';

		loginHelpHidden.innerHTML = text;

		if (extraHelpText)
		{
			this.loginHelpExtra.innerHTML = extraHelpText;
			this.loginHelpExtra.style.marginTop = `${loginHelpHidden.offsetHeight + 8}px`;
		}
		else
		{
			this.loginHelpExtra.innerHTML = '';
		}

		this.currentHelpTextState = helpTextState;
		this.isLoginHelpPrimary = !this.isLoginHelpPrimary;
	}

	private onLoginHelpMouseOver(): void 
	{
		this.loginHelpExtra.style.opacity = '1';
	}

	private onLoginHelpMouseOut(): void 
	{
		this.loginHelpExtra.style.opacity = '0';
	}
}

enum HelpTextStates {
	EnterEmail,
	Login,
}

const biometricDiary = new BiometricDiary();

class BiometricDiary {
	private mainContainer: HTMLElement;
	private typingDna: any;

	// Login Help
	private loginHelpSpinner = document.querySelector('.login-help-spinner') as HTMLElement;
	private currentHelpTextState: HelpStates = null;
	private isLoginHelpPrimary = true;
	private loginHelp = document.querySelector('.login-help') as HTMLElement;
	private loginHelpText1 = document.querySelector('.login-help-text__1') as HTMLElement;
	private loginHelpText2 = document.querySelector('.login-help-text__2') as HTMLElement;
	private loginHelpExtra = document.querySelector('.login-help-extra') as HTMLElement;

	private loginButton = document.querySelector('.login-button') as HTMLElement;
	private loginInput = document.getElementById('login-input') as HTMLInputElement;

	private loginId = '';

	constructor() 
	{
		this.Initialize();
	}

	private Initialize()
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
			loginResult = { loginStatus: LoginStatus.error };
		}

		switch(loginResult.loginStatus)
		{
			case LoginStatus.success:
				this.OnLoginSuccess();
				break;

			case LoginStatus.userNotFound:
				this.OnUserNotFound(loginValue);
				break;

			case LoginStatus.failure:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, LANG_DICT.Login.FailedLogin);
				break;

			case LoginStatus.error:
			default:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, LANG_DICT.Login.ErrorLogin);
				break;
		}
	}

	private OnUserNotFound(loginId: string): void
	{
		const userNotFoundElements = document.createElement('div');
		userNotFoundElements.className = "login-help-with-button";
		userNotFoundElements.innerText = LANG_DICT.Login.UserNotFound;
		
		const userNotFoundButtonContainer = document.createElement('div');
		userNotFoundButtonContainer.className = "login-help-buttons";
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
			createAccountResult = { loginStatus: LoginStatus.error };
		}

		switch (createAccountResult.loginStatus)
		{
			case LoginStatus.success:
				this.OnLoginSuccess();
				break;

			case LoginStatus.failure:
				this.loginInput.removeAttribute('disabled');
				this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, LANG_DICT.Login.FailedLogin);			
				break;

			case LoginStatus.error:
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
			this.loginHelpExtra.style.marginTop = `${loginHelpHidden.offsetHeight + 8}px`;
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
		this.loginHelpExtra.style.opacity = '1';
	}

	private OnLoginHelpMouseOut(): void 
	{
		this.loginHelpExtra.style.opacity = '0';
	}

	private OnLoginSuccess(): void
	{
		this.UpdateLoginHelp(false, false, null, "");
		// Switch to note input tracking

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

enum LoginStatus {
	success,
	userNotFound,
	accountCreated,
	accountNotCreated,
	failure,
	error
}

const biometricDiary = new BiometricDiary();

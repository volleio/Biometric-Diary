class BiometricDiaryClient {
	private static QUALITY_UPDATE_MINIMUM_KEYPRESSES = 10;
	private static MATCH_UPDATE_MAXIMUM_KEYPRESSES = 30;
	private static MATCH_UPDATE_MINIMUM_QUALITY = 0.5;

	private static NOTE_SAVE_INTERVAL = 2000;
	private static NOTE_REQUEST_INTERVAL = 500;

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
	private loginAuthBadgeCheck = this.loginAuthBadge.querySelector('.login-auth-badge__check') as HTMLElement;
	
	private loginId = '';

	private authMatchProgressRing: ProgressRing;
	private authUpdateProgressRing: ProgressRing;

	private notesContainer = document.querySelector('.notes-container') as HTMLElement;
	private noteInputTemplate = document.getElementById('note-input-template') as HTMLTemplateElement;
	private initialNoteContainer: HTMLTextAreaElement;
	private initialNoteInput: HTMLTextAreaElement;
	private notes: Note[] = [];
	private endOfNotes = this.notesContainer.querySelector('.end-of-notes') as HTMLElement;
	private notesSpinner = this.notesContainer.querySelector('.notes-spinner') as HTMLElement;
	
	private onInitialNoteKeyDown: (evt: KeyboardEvent) => void;

	private keysPressed = 0; // Just for stats
	private keysPressedSinceQualityUpdate = 0;
	private currentPatternQuality = 0;
	private keysPressedSinceMatchUpdate = 0;

	private requestingUserNotes = false;
	private shouldRequestUserNotes = false;
	private reachedEndOfNotes = false;
	private savingNotes = false;
	private lowestNoteIndexRetrieved = Number.MAX_SAFE_INTEGER;
	private notesToSave: Set<Note> = new Set();

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

			const warningClose = mobileWarning.querySelector('.warning-close') as HTMLButtonElement;
			warningClose.addEventListener('click', () => mobileWarning.style.display = 'none');
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

		this.initialNoteContainer = document.importNode(this.noteInputTemplate.content, true).querySelector('.note-container');
		this.initialNoteInput = this.initialNoteContainer.querySelector('.note-input');
		this.initialNoteInput.id = 'initial-note-input';
		this.notesContainer.insertAdjacentElement('afterbegin', this.initialNoteContainer);
	}

	private async SubmitLogin(): Promise<void>
	{
		this.UpdateLoginHelp(true, true, null, '');
		const loginValue = this.loginInput.value;
		this.loginInput.setAttribute('disabled', '');
		this.loginButton.setAttribute('disabled', '');

		const typingPattern: string = this.typingDna.getTypingPattern({
			type: 1,
			text: loginValue,
		});
		this.typingDna.reset();
		
		let loginResult;
		try
		{
			loginResult = await (await fetch('/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					typingPattern,
					loginId: loginValue,
				}),
			})).json();
		}
		catch (err)
		{
			console.error(err);
			loginResult = { authenticationStatus: AuthenticationStatus.error };
		}

		switch (loginResult.authenticationStatus)
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
		createAccountButton.addEventListener('click', (evt) => 
		{
			this.loginId = loginId;

			this.loginInput.removeAttribute('disabled');
			this.loginInput.focus();
			this.loginInput.value = '';
			this.UpdateLoginHelp(true, false, HelpStates.CreateAccount, LANG_DICT.Login.RetypeLogin(loginId));
		});
		
		const cancelButton = document.createElement('button');
		cancelButton.className = 'secondary-button';
		cancelButton.innerText = LANG_DICT.Login.CancelLogin;
		cancelButton.addEventListener('click', (evt) => 
		{
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

		const typingPattern: string = this.typingDna.getTypingPattern({
			type: 1,
			text: loginValue,
		});
		this.typingDna.reset();

		let createAccountResult;
		try
		{
			createAccountResult = await (await fetch('/create-account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					typingPattern,
				}),
			})).json();
		}
		catch (err)
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
		this.loginAuthBadgeCheck.classList.add('animate-in');

		// Set up auth badge progress rings
		const authUpdateProgressRingCircle = this.loginAuthBadge.querySelector('.auth-update-progress-ring > .progress-ring__circle') as SVGCircleElement;
		this.authUpdateProgressRing = new ProgressRing(authUpdateProgressRingCircle);
		const authMatchProgressRingCircle = this.loginAuthBadge.querySelector('.auth-match-progress-ring > .progress-ring__circle') as SVGCircleElement;
		this.authMatchProgressRing = new ProgressRing(authMatchProgressRingCircle);

		// Set up main menu
		const mainMenu = this.loginContainer.querySelector('.main-menu') as HTMLElement;
		mainMenu.style.display = 'flex';
		requestAnimationFrame(() => mainMenu.style.opacity = '1');
		
		this.loginContainer.addEventListener('mouseenter', () =>
		{
			this.loginContainer.style.height = `${this.loginContainer.scrollHeight}px`;
		});
		
		this.loginContainer.addEventListener('mouseleave', () =>
		{
			this.loginContainer.style.height = '';
		});
		
		const logoutButton = mainMenu.querySelector('.logout-button') as HTMLElement;
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
		this.typingDna.addTarget('initial-note-input');
		
		this.onInitialNoteKeyDown = (evt) => { requestAnimationFrame(() => this.OnInitialNoteValueUpdate()); };
		this.initialNoteInput.addEventListener('keydown', this.onInitialNoteKeyDown);
		this.initialNoteInput.focus();
	}

	private OnInitialNoteValueUpdate(): void
	{
		this.keysPressed += 1;
		this.keysPressedSinceQualityUpdate += 1;
		this.keysPressedSinceMatchUpdate += 1;

		this.UpdateAuthUpdateProgressRing();

		/**
		 * Before checking a typing pattern against TypingDNA's API, the typing pattern must meet a minimum 
		 * typing pattern quality, or must exceed the maximum number of keypresses for a single match update.
		 */

		// Check typing quality every few (~10) characters
		if (this.keysPressedSinceQualityUpdate >= BiometricDiaryClient.QUALITY_UPDATE_MINIMUM_KEYPRESSES)
		{
			this.keysPressedSinceQualityUpdate = 0;

			const typingPattern: string = this.typingDna.getTypingPattern({
				type: 2,
				text: this.initialNoteInput.value,
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
				this.SubmitInitialNoteTypingPattern();
			}
		}
	}

	private async SubmitInitialNoteTypingPattern()
	{
		const initialNoteValue = this.initialNoteInput.value;

		const typingPattern: string = this.typingDna.getTypingPattern({
			type: 2,
			text: initialNoteValue,
		});
		
		let initialNoteMatchResult;
		try
		{
			initialNoteMatchResult = await (await fetch('/authenticate-note', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					typingPattern,
					noteContents: initialNoteValue,
				}),
			})).json();
		}
		catch (err)
		{
			console.error(err);
			initialNoteMatchResult = { authenticationStatus: AuthenticationStatus.error };
		}

		console.debug(initialNoteMatchResult);

		const authProgress = initialNoteMatchResult.authenticationProgress;
		this.authMatchProgressRing.SetProgress(authProgress * 0.8); // Show max progress of 80%, so that progress doesn't appear to be complete without success
		
		/**
		 * When we've successfully fully authenticated the user by matching their anytext typing pattern,
		 * we swap the auth typing event listener out for an event listener that auto saves the note, and
		 * set up the rest of the user's notes
		 */
		if (initialNoteMatchResult.authenticationStatus === AuthenticationStatus.success)
			this.OnInitialNoteSuccess(initialNoteMatchResult.noteData);
	}

	private OnInitialNoteSuccess(initialNoteData: INote): void
	{
		this.authMatchProgressRing.SetProgress(1);
		this.authMatchProgressRing.progressRing.setAttribute('fill', '#46AB2B');
		this.loginAuthBadgeCheck.classList.remove('animate-in');
		this.loginAuthBadgeCheck.classList.add('auth-success');

		this.initialNoteInput.removeEventListener('keydown', this.onInitialNoteKeyDown);
		const initialNote = new Note(initialNoteData, this.initialNoteContainer, (note: Note) => this.OnAnyNoteValueUpdate(note));	
		
		this.RequestUserNotes(initialNoteData.Index);

		const endOfNotesIntersectionObserver = new IntersectionObserver((entries) => 
		{
			this.shouldRequestUserNotes = entries.length > 0 && entries[0].isIntersecting;
		});
		endOfNotesIntersectionObserver.observe(this.endOfNotes);
		window.setInterval(() => 
		{ 
			if (this.shouldRequestUserNotes && !this.reachedEndOfNotes)
				this.RequestUserNotes(this.lowestNoteIndexRetrieved);
		}, BiometricDiaryClient.NOTE_REQUEST_INTERVAL);

		window.setInterval(() => this.SaveNotes(), BiometricDiaryClient.NOTE_SAVE_INTERVAL);
	}

	private OnAnyNoteValueUpdate(note: Note): void
	{
		note.SetSavingState(true);
		note.SetDateUpdated(new Date());
		this.notesToSave.add(note);
	}

	private async SaveNotes(): Promise<void>
	{
		if (this.savingNotes || this.notesToSave.size === 0)
			return;

		this.savingNotes = true;
		
		const notesBeingSaved: Note[] = [];
		const notesDataToSave: INote[] = [];
		this.notesToSave.forEach((note) => 
		{
			note.SetSavingState(true);
			notesBeingSaved.push(note);
			notesDataToSave.push(note.GetNoteData());
		});
		this.notesToSave.clear();

		try
		{
			await fetch('/save-notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notesToSave: notesDataToSave }),
			});
		}
		catch (err)
		{
			console.error(err);
		}
		finally
		{
			notesBeingSaved.forEach(note => note.SetSavingState(false));
			this.savingNotes = false;
		}
	}

	private async RequestUserNotes(beforeIndex: number): Promise<void>
	{
		if (this.requestingUserNotes)
			return; // Request currently being made

		this.requestingUserNotes = true;
		this.notesSpinner.style.opacity = '1';

		let notesRequestResult: INotesRequest;
		try
		{
			notesRequestResult = await (await fetch('/get-notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ beforeIndex }),
			})).json();

			notesRequestResult.retrievedNotes.forEach(noteData => this.InsertNewNote(noteData));

			// Indicate when the user has reached the end
			if (notesRequestResult.noAdditionalNotes)
			{
				this.reachedEndOfNotes = true;
				const endOfNotesMsg = this.endOfNotes.querySelector('.end-of-notes__msg') as HTMLElement;
				endOfNotesMsg.innerHTML = LANG_DICT.Notes.EndOfNotes;
				this.endOfNotes.style.display = '';
			}
		}
		catch (err)
		{
			console.error(err);
		}
		finally
		{
			this.requestingUserNotes = false;
			this.notesSpinner.style.opacity = '';
		}
	}

	private InsertNewNote(noteData: INote): void
	{
		const noteContainer = document.importNode(this.noteInputTemplate.content, true).querySelector('.note-container') as HTMLElement;
		this.endOfNotes.insertAdjacentElement('beforebegin', noteContainer);

		const note = new Note(noteData, noteContainer, updatedNote => this.OnAnyNoteValueUpdate(updatedNote));
		this.notes.push(note);

		if (noteData.Index < this.lowestNoteIndexRetrieved)
			this.lowestNoteIndexRetrieved = noteData.Index;
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
		progress *= 1 - this.authMatchProgressRing.progress;
		progress += this.authMatchProgressRing.progress;
		this.authUpdateProgressRing.SetProgress(progress);
	}

	private ExecuteWithoutTransition(element: HTMLElement, callback: () => void): void
	{
		const setTransition = element.style.transition;
		element.style.transition = 'none';
		callback();
		const forceLayout = getComputedStyle(element).opacity;
		element.style.transition = setTransition;
	}
}

/**
 * Original implementation by jeremenichelli.io @ https://css-tricks.com/building-progress-ring-quickly/
 */
class ProgressRing
{
	public progressRing: SVGCircleElement;
	public progress = 0;

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
		this.progress = progress;
		const offset = this.circumference - this.progress * this.circumference;
		this.progressRing.style.strokeDashoffset = offset.toString();
	}

	public RotateRing(degrees?: number): void
	{
		if (degrees == null)
			this.fullRotations += 1;
		else
			this.partialRotation = degrees;
			
		this.progressRing.parentElement.style.transform = `rotate(${this.fullRotations * 360 + this.partialRotation}deg)`;
	}
}

class Note
{
	private id: string;
	private index: number;
	private dateCreated: Date;
	private dateUpdated: Date;

	private container: HTMLElement;
	private input: HTMLTextAreaElement;
	
	private onValueUpdate: (note: Note) => void;

	constructor(data: INote, container: HTMLElement, onValueUpdate: (note: Note) => void)
	{
		this.id = data.Id;
		this.index = data.Index;
		this.dateCreated = new Date(data.DateCreated);
		this.dateUpdated = new Date(data.DateUpdated);

		this.container = container;
		this.input = this.container.querySelector('.note-input');

		this.onValueUpdate = onValueUpdate;

		this.Initialize(data);
	}
	
	public GetNoteData(): INote
	{
		return {
			Id: this.id,
			Index: this.index,
			Content: this.input.value,
			DateCreated: this.dateCreated.valueOf(),
			DateUpdated: this.dateUpdated.valueOf(),
		} as INote;
	}

	public SetDateUpdated(date: Date) { this.dateUpdated = date; }
	public SetIndex(index: number) { this.index = index; }
	
	public SetSavingState(saving: boolean)
	{
		if (saving)
		{
			this.container.classList.add('note-saving');
			this.container.classList.remove('note-saved');
		}
		else
		{
			this.container.classList.remove('note-saving');
			this.container.classList.add('note-saved');
		}
	}

	private Initialize(data: INote): void
	{
		this.input.value = data.Content;
		this.input.addEventListener('keydown', () => window.requestAnimationFrame(() => this.onValueUpdate(this)));
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
	error,
}

interface INote {
	Id: string;
	Index: number;
	Content: string;
	DateCreated: number;
	DateUpdated: number;
}

interface INotesRequest {
	retrievedNotes: INote[];
	noAdditionalNotes: boolean;
}

const biometricDiary = new BiometricDiaryClient();

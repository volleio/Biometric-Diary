let LANG_DICT = {
	Login: {
		ExtraHelpQuestionMark: '?',
		EnterEmail: 'please enter your email',
		EnterEmailExtra: `any 8+ character username will work, 
		but your account can only be recovered if your email is used.`,
		LoginButton: 'login',
		UserNotFound: 'User not found, would you like to create an account?',
		CreateAccount: 'create account',
		CancelLogin: 'cancel',
		RetypeLogin: (loginId) => `please retype '${loginId}' to verify your typing pattern`,
		FailedLogin: 'Authentication failed, please try again.',
		ErrorLogin: 'Error with authentication service, please try again later.',
	},
	MainMenu: {
		Logout: 'logout',
	}
};

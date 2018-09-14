// Type definitions for typingdna.js
// Project: https://api.typingdna.com 
// Definitions by: Lucas Volle https://github.com/volleio
// Definitions: https://github.com/borisyankov/DefinitelyTyped

/**
 * Creates a single instance (or a reference) of the TypingDNA class
 * @return {Object} Returns the single instance of the TypingDNA class.
 * @example var tdna = new TypingDNA();
 */
declare class TypingDNA 
{
	new(): void;

	/**
	 * Automatically called at initilization. It starts the recording of keystrokes.
	 * @return  
	 */
	start(): boolean;
		
	/**
	 * Ends the recording of further keystrokes. To restart recording afterwards you can
	 * either call TypingDNA.start() or create a new TypingDNA object again, not recommended.
	 * @return  
	 */
	stop(): boolean;
		
	/**
	 * Resets the history stack
	 */
	reset(): void;
		
	/**
	 * Adds a target to the targetIds array.
	 * @param target 
	 */
	addTarget(targetId: string): void;
		
	/**
	 * Removes a target from the targetIds array.
	 * @param target 
	 */
	removeTarget(targetId: any): void;
		
	/**
	 * This is the main function that outputs the typing pattern as a String
	 * {type:Number, text:String, textId:Number, length: Number, targetId:String, caseSensitive:Boolean}
	 * @param {Object} optionsObject 
	 * @return {String} A typing pattern in string form
	 * @example var typingPattern = tdna.getTypingPattern({type:0, length:180});
	 * @example var typingPattern = tdna.getTypingPattern({type:1, text:"Hello5g21?*"});
	 * @example var typingPattern = tdna.getTypingPattern({type:2, text:"example@mail.com"});
	 * @param obj 
	 * @return  
	 */
	getTypingPattern(optionsObject: getTypingPatternOptions): string;
		
	/**
	 * Checks the quality of a typing pattern, how well it is revelated, how useful the
	 * information will be for matching applications. It returns a value between 0 and 1.
	 * Values over 0.3 are acceptable, however a value over 0.7 shows good pattern strength.
	 * @param  {String} typingPattern The typing pattern string returned by the get() function.
	 * @return {Number} A real number between 0 and 1. A close to 1 value means a stronger pattern.
	 * @example var quality = tdna.getQuality(typingPattern);
	 * @param typingPattern 
	 * @return  
	 */
	getQuality(typingPattern : string): number;
}

/**
 * @param {String} type 0 for anytext pattern, 1 for sametext pattern (also called diagram pattern)
 * and 2 for extended pattern (most versatile, can replace both anytext and sametext patterns)
 * @param {Number} length (Optional) the length of the text in the history for which you want
 * the typing pattern. length is ignored when text or targetId is set (or both).
 * @param {String} text  (Only for type 1 and type 2) a typed string that you want the typing pattern for
 * @param {Number} textId (Optional, only for type 1 and type 2) a personalized id for the typed text
 * @param {String} targetId (Optional) specifies if pattern is obtain only from text typed in a certain target
 * @param {Boolean} caseSensitive (Optional, default: false) Used if you pass a text for type 1 or type 2
 * DEPRECATED * * * in favor of type = 2 * * *
 * @param {Boolean} extended (Only for type 1) specifies if full information about what was typed is produced,
 * including the actual key pressed, if false, only the order of pressed keys is kept (no actual content)
 */
declare interface getTypingPatternOptions 
{
	type: string;
	length: number;
	text: string;
	textId: number;
	targetId: string;
	caseSensitive: boolean;
	extended: boolean;
}
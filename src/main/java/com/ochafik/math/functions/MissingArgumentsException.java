/**
 * 
 */
package com.ochafik.math.functions;

@SuppressWarnings("serial")
public class MissingArgumentsException extends FunctionException {

	public MissingArgumentsException() {
		super();
	}

	public MissingArgumentsException(String message, Throwable cause) {
		super(message, cause);
	}

	public MissingArgumentsException(String message) {
		super(message);
	}

	public MissingArgumentsException(Throwable cause) {
		super(cause);
	}
	
}
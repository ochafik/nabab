/*
 * Copyright (C) 2011 by Olivier Chafik (http://ochafik.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

package com.ochafik.util;
import java.io.PrintStream;

public class ShellUtils {
	public static final int shellColumns=80,espLn=1;
	static final String addEsp=" ";
	public static final char charAv='#',charLn='-';
	public static final PrintStream printStream=System.err;

	public static final void centrerln(String s) {
		centrerln(s, printStream);
	}
	public static final void centrerln(String s, PrintStream printStream) {
		StringBuffer b=new StringBuffer();
		int ls=shellColumns-s.length()-2*espLn,l1=ls/2;
		if (ls==0) {
			for (int i=0;i<shellColumns;i++) b.append(charLn);
			printStream.print(b.toString());
		} else {
			final PrintStream av=printStream;
			for (int i=0;i<l1;i++) b.append(charLn);
			String deco=b.toString();
			av.print(deco);
			av.print(addEsp);
			av.print(s);
			av.print(addEsp);
			if ((ls % 2)==1) {
				av.print(deco);
				av.print/*ln*/(charLn);
			} else av.print/*ln*/(deco);
		}
	}
}
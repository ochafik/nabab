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
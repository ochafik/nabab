package com.ochafik.awt;
import java.awt.Component;
import java.awt.Frame;
import java.io.PrintStream;

import com.ochafik.awt.dialogs.ChoiceDialog;
import com.ochafik.awt.dialogs.ComboDialog;
import com.ochafik.awt.dialogs.LogDialog;

/**
DEPRECATED : use ochafik.swing.JDialogs instead !!!

*/
public class JDialogs extends com.ochafik.swing.JDialogs {
	public static final int YES=1,NO=2,CANCEL=3,UNDEFINED=0;
	public static final PrintStream log(Component c,String title) {
		Frame f=OldAWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;
		LogDialog ld=new LogDialog(f,title);
		OldAWTUtils.hidingFrame(ld);
		ld.show();
		return ld.out;
	}
	public static final void error(String title,Throwable ex) {
		error(null,title,ex);
	}
	public static final void error(Component c,String title,Throwable ex) {
		error(c,title,null,ex);
	}
	public static final int choice(Component c, String title, String text, 
		String[] choices, int sel) {
		return choice(c,title,text,choices,sel,"Ok","Annuler");
	}
	public static final int choice(Component c, String title, String text, 
			String[] choices, int sel, String okLab, String cancelLab) {
		Frame f=OldAWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;
		ChoiceDialog d=new ChoiceDialog(f,title,text,choices,sel,okLab,cancelLab,true);
		return d.getAnswer();
	}
	public static final int combo(Component c, String title, String text, 
		String[] choices, int sel) {
		return combo(c,title,text,choices,sel,"Ok","Annuler");
	}
	public static final int combo(Component c, String title, String text, 
			String[] choices, int sel, String okLab, String cancelLab) {
		Frame f=OldAWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;
		ComboDialog d=new ComboDialog(f,title,text,choices,sel,okLab,cancelLab,true);
		return d.getAnswer();
	}
	/*public static final String input(Component c, String title, String text, 
		String def) {
		Frame f=OldAWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;
		InputDialog d=new InputDialog(f,title,text,def);
		return d.getAnswer();
	}*/
}


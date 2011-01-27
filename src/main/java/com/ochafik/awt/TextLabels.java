package com.ochafik.awt;
import java.awt.BorderLayout;
import java.awt.Frame;
import java.awt.Label;
import java.awt.Panel;
import java.util.StringTokenizer;

import javax.swing.Box;
import javax.swing.BoxLayout;

public class TextLabels extends Panel {
	public static void mainTest(String arg[]) {
		if (arg.length==2) showTextOk(new Frame(),arg[0],arg[1]);
	}
	public TextLabels() {}
	public final void setText(String text) {
		removeAll();
		setLayout(new BorderLayout());
		Box b=new Box(BoxLayout.Y_AXIS);
		StringTokenizer st=new StringTokenizer(text,"\n");
		while (st.hasMoreTokens()) {
			b.add(new Label(st.nextToken()));
		}
		add("Center",b);
	}
	public TextLabels(String text) {
		super();
		setText(text);
	}
	public static void showTextOk(Frame f, String tit, String tx) {
		(new SimpleDialogShower(f,tit,new TextLabels(tx),"Ok")).show();
	}
}

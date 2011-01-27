/*
 * Copyright (C) 2006-2011 by Olivier Chafik (http://ochafik.com)
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

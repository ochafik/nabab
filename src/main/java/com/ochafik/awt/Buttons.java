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
import java.awt.Button;
import java.awt.GridLayout;
import java.awt.Panel;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.Enumeration;
import java.util.Vector;

import com.ochafik.awt.event.ButtonsListener;

public class Buttons extends Panel implements ActionListener {
	String labels[];
	Button buttons[];
    public Buttons(String[] labs) {
		super();
		int cl=labs.length;
		labels=labs;
		setLayout(new GridLayout(1,cl));
		buttons=new Button[cl];
		for (int i=0; i<cl;i++) {
				Button bt=(buttons[i]=new Button(labs[i]));
				bt.addActionListener(this);
				add(bt);
		}
    }
	public void actionPerformed(ActionEvent ev) {
		Button b=(Button)(ev.getSource());
		int ib=-1;
		for (int i=buttons.length-1;i!=-1;i--) {
			if (buttons[i]==b) ib=i;	
		}
		for (Enumeration lis=buttonsListeners.elements();lis.hasMoreElements();) 
			((ButtonsListener)(lis.nextElement())).buttonFired(labels[ib],ib);
	}
	Vector buttonsListeners=new Vector();
	public void addButtonsListener(ButtonsListener b) {
		buttonsListeners.addElement(b);
	}
}

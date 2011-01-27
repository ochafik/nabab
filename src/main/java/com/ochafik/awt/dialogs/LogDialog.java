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

package com.ochafik.awt.dialogs;

import java.awt.Frame;
import java.awt.TextArea;
import java.io.PrintStream;

import com.ochafik.awt.OldAWTUtils;
import com.ochafik.awt.Placeur;
import com.ochafik.io.TextAreaOutputStream;


public class LogDialog extends Frame {
	TextArea tLog=new TextArea(8,15);
	public LogDialog(Frame f,String title) {
		super(title);
		OldAWTUtils.fillContainer(this, new Object[][] {
			{	new Object[] {"Rapport de compilation","W"}
			},
			{	new Object[] {tLog,"FILL"}
			}
		});			
		pack();
		Placeur.dimensionnerAvecTitre(this);
		Placeur.centrer(this,f);
	}
	public PrintStream out=new PrintStream(new TextAreaOutputStream(tLog));
	public void close() {
		out.close();
		setVisible(false);
	}
}	

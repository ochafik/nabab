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

package com.ochafik.awt.dialogs;
//package ochafik.awt;
import java.awt.BorderLayout;
import java.awt.Button;
import java.awt.Choice;
import java.awt.Dialog;
import java.awt.FlowLayout;
import java.awt.Frame;
import java.awt.Panel;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;

import com.ochafik.awt.OldAWTUtils;
import com.ochafik.awt.Placeur;
import com.ochafik.awt.TextLabels;

public class ComboDialog extends Dialog implements ActionListener, KeyListener {
	Button okB;
	Choice cbs;
    public ComboDialog(Frame owner, String title, String text, String[] choices, 
			int sel, String okLab, String cancelLab, boolean modal) {
		super(owner,title,modal);
		okB=new Button(okLab);
		Button cancelB=new Button(cancelLab);
		okB.addActionListener(this);
		okB.addKeyListener(this);
		cancelB.addActionListener(this);
		cancelB.addKeyListener(this);
		setLayout(new BorderLayout());
		int cl=choices.length;
		if (text!=null&&!text.trim().equals("")) {
			add("North",new TextLabels(text)).addKeyListener(this);
		}
		
		cbs=new Choice();
		for (int i=0; i<cl;i++) {
				cbs.add(choices[i]);
		}
		//java.awt.List l=new List(h>0 ? h : (cl<DEFAULTHEIGHT ? cl : DEFAULTHEIGHT));
		//b.add(ls);
		add("Center",cbs);
		Panel p=new Panel(new FlowLayout());
		p.add(okB);
		p.add(cancelB);
		add("South",p).addKeyListener(this);;
		pack();
		okB.requestFocus();
    }
	boolean cancelled=false;
    public void actionPerformed(ActionEvent evt) {
		setVisible(false);
		cancelled=evt.getSource()!=okB;
    }
    	public void keyTyped(KeyEvent e) {}
	public void keyReleased(KeyEvent e) {}
	public void keyPressed(KeyEvent e) {
		if (e.getKeyCode()==KeyEvent.VK_ESCAPE) {
			setVisible(false);
			cancelled=true;
		}
	}
	public int getAnswer() {
		Placeur.dimensionnerAvecTitre(this);
		Placeur.centrer(this,OldAWTUtils.getTheFrame(this));
		okB.requestFocus();
		show();
		return cbs.getSelectedIndex();
	}
}

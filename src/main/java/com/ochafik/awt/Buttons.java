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

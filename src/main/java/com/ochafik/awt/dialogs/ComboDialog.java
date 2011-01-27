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

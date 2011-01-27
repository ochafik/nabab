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

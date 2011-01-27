package com.ochafik.awt;
import java.awt.BorderLayout;
import java.awt.Button;
import java.awt.Component;
import java.awt.Dialog;
import java.awt.Frame;
import java.awt.Panel;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

public class SimpleDialogShower extends Dialog implements ActionListener {
	public SimpleDialogShower(Frame f,String t,Component c, String b) {
		super(f,t);
		setLayout(new BorderLayout());
		add("Center",c);
		Button bb;
		Panel p=new Panel();
		p.add(bb=new Button(b));
		add("South",p);
		bb.addActionListener(this);
				pack();
	}
	public void actionPerformed(ActionEvent e) {
		this.setVisible(false);
		/*try {
			this.finalize();
		}catch (Throwable except) { System.out.println("***ERREUR : "+except.toString()+" ***"); }*/
		
	}
}

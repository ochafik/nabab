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

package com.ochafik.swing;
//import ochafik.awt.AWTUtils;
//import ochafik.io.*;
//import java.net.*;
//import ochafik.util.*;
//import ochafik.awt.font.*;
//import ochafik.awt.event.*;
import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.FileDialog;
import java.awt.Frame;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;

import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JFileChooser;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;

import com.ochafik.util.SystemUtils;

public class JDialogs {
    public static final int YES=1,NO=2,CANCEL=3,UNDEFINED=0;
    public static final void alert(String title,String text) {
		alert(null,title,text);
    }	
    public static final String input(Component c,String title,String text, String def) {
		return (String)JOptionPane.showInputDialog(c,text,title,JOptionPane.QUESTION_MESSAGE,null,null,def);
    }
    public static final char[] passwordInput(Component c, String title, String text) {
    		JPasswordField passwordField = new JPasswordField(20);
    		passwordField.setEchoChar('*');
    		int ret = JOptionPane.showConfirmDialog(c, new Object[] {text,passwordField}, title, JOptionPane.OK_CANCEL_OPTION, JOptionPane.WARNING_MESSAGE);
    		if (ret == JOptionPane.OK_OPTION) {
    			return passwordField.getPassword();
    		} else {
    			return null;
    		}
    }
    public static final void alert(Component c,String title,String text) {
		JOptionPane.showMessageDialog(c,/*SwingUtils.getLabelComponent(*/text/*)*/,title,-1/*plain_message*/);
    }
    public static final boolean confirm(String title,String text) {
    	return confirm(null,title,text);
    }
    public static final void error(Component c, String title, String message, Throwable th) {
    		StringWriter sw = new StringWriter();
		th.printStackTrace(new PrintWriter(sw));
		JOptionPane.showMessageDialog(c,new Object[] {message, new JScrollPane(new JTextArea(sw.toString()))},title,-1/*plain_message*/);
    }
	public static final boolean confirm(Component c,String title,String text) {
		return JOptionPane.showConfirmDialog(c,text,title,JOptionPane.YES_NO_OPTION)==JOptionPane.OK_OPTION;
		/*Frame f=OldAWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;
	
		YesNoDialog d=new YesNoDialog(f,title,text);
		return d.getAnswer()==YES;*/
    }
    /*	public static void error(Component c, String title, String text, Throwable ex) {
		StringBufferOutputStream sbout=new StringBufferOutputStream();
		PrintStream out=new PrintStream(sbout);
		ex.printStackTrace(out);
		
		JScrollPane pane=new JScrollPane(new JTextArea(sbout.toString()));
		Dimension dim=Toolkit.getDefaultToolkit().getScreenSize();
		Dimension pdim=pane.getPreferredSize();
		int maxw=dim.width/2,maxh=dim.height/2,pw=pdim.width,ph=pdim.height;
		pane.setPreferredSize(new Dimension(
			pw<0 ? maxw : (pw<maxw ? pw : maxw),
			ph<0 ? maxh : (ph<maxh ? ph : maxh)
			));
		JOptionPane.showMessageDialog(
			c,
			new Object[]{
				text==null ? "Erreur" : text,
				pane
			},
			title,
			JOptionPane.ERROR_MESSAGE
		);
	}*/
	static File lastFile;
    	public static final File file(Component c, String label, boolean open, File f, JComponent accessory) {
		File directory;
		if (f!=null) 
			directory=f.isDirectory() ? f : f.getParentFile();
		else if (lastFile!=null) directory=lastFile.isDirectory() ? lastFile : lastFile.getParentFile();
		else directory=new File(System.getProperty("user.home","."));
		
		if (SystemUtils.isMacOSX()) {
			// On MacOS X, use the native AWT file chooser instead of Swing's (ways better)
			FileDialog fd=new FileDialog(new Frame(),label,open ? FileDialog.LOAD : FileDialog.SAVE);
			if (f != null) fd.setFile(f.getName());
			fd.setDirectory(directory.getAbsolutePath());
			fd.setModal(true);
			fd.setVisible(true);
			String fret = fd.getFile(), diret = fd.getDirectory();
			return fret==null ? null : (lastFile = new File(diret,fret));
		} else {
			JFileChooser fc=new JFileChooser(directory);//f==null ? (lastFile==null ? new File(System.getProperty("user.home",".")) : lastFile) : f);
			if (f!=null) fc.setSelectedFile(f);
			fc.setAccessory(accessory);
			int ret;
			if (label==null) {
				ret=open ? fc.showOpenDialog(c) : fc.showSaveDialog(c);
			} else	ret=fc.showDialog(c,label);
			return ret==JFileChooser.APPROVE_OPTION ? lastFile=fc.getSelectedFile() : null;
		}
	}
	public static final File file(Component c, String label, boolean open, File f) {
		return file(c,label,open,f, null);
	}
	public static final File directory(Component c, String label, boolean open, File f) {
		JFileChooser fc=new JFileChooser(f==null ? new File(System.getProperty("user.home",".")) : f);
		int ret;
		//fc.setDialogType(JFileChooser.DIRECTORIES_ONLY);
		fc.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
		if (label==null) {
			ret=open ? fc.showOpenDialog(c) : fc.showSaveDialog(c);
		} else	ret=fc.showDialog(c,label);
		return ret==JFileChooser.APPROVE_OPTION ? fc.getSelectedFile() : null;
	}
	public static final String directoryInput(
		Component c,
		String title,
		String text, 
		String def) {
		return fileInput(c,title,text,def,true);
	}
	public static final String fileInput(
		Component c,
		String title,
		String text, 
		String def) {
		return fileInput(c,title,text,def,false);
	}
	public static final String fileInput(
		Component c,
		String title,
		String text, 
		String def,
		final boolean directoriesOnly) {
		
		Frame f=null;//AWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;

		final JTextField tFile=new JTextField(def==null ? "" : def,20);
		final JButton bBrowse=new JButton("Parcourir");
		JPanel pan=new JPanel(new BorderLayout());
		pan.add("Center",tFile);
		pan.add("East",bBrowse);
		bBrowse.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent ev) {
				String st=tFile.getText().trim();
				if (st.equals("")) st=".";
				File f=new File(st);
				JFileChooser jfc=new JFileChooser(f.getParentFile());
				if (directoriesOnly) jfc.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
				String name=f.getName();
				if (name!=null&&!name.equals("")) jfc.setSelectedFile(f);
				if (jfc.showDialog((Component)ev.getSource(),"Choisir")==JFileChooser.APPROVE_OPTION) {
					tFile.setText(jfc.getSelectedFile().toString());
				}
			}
		});
		//tFile.addActionListener();
		int answ=JOptionPane.showConfirmDialog(
				f,
				new Object[]{
					text,
					pan
				},
				title,
				JOptionPane.OK_CANCEL_OPTION,
				JOptionPane.QUESTION_MESSAGE
		);
		if (answ==JOptionPane.OK_OPTION) {
			return tFile.getText();			
		} else return null;
	}
	public static final String urlInput(
		Component c,
		String title,
		String text, 
		String def) {
		
		Frame f=null;//AWTUtils.getTheFrame(c);
		f=f==null ? new Frame("") : f;

		final JTextField tFile=new JTextField(def==null ? "" : def,20);
		final JButton bBrowse=new JButton("Parcourir");
		JPanel pan=new JPanel(new BorderLayout());
		pan.add("Center",tFile);
		pan.add("East",bBrowse);
		bBrowse.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent ev) {
				String st=tFile.getText().trim();
				if (st.equals("")) st=".";
				File f=new File(st);
				JFileChooser jfc=new JFileChooser(f.getParentFile());
				String name=f.getName();
				if (name!=null&&!name.equals("")) jfc.setSelectedFile(f);
				if (jfc.showDialog((Component)ev.getSource(),"Choisir")==JFileChooser.APPROVE_OPTION) {
					File chosenFile=jfc.getSelectedFile();
					if (chosenFile!=null) 
						try {
							tFile.setText(chosenFile.toURL().toString());
						} catch (IOException ex) {
							tFile.setText(chosenFile.toString());
						}
				}
			}
		});
		//tFile.addActionListener();
		int answ=JOptionPane.showConfirmDialog(
				f,
				new Object[]{
					text,
					pan
				},
				title,
				JOptionPane.OK_CANCEL_OPTION,
				JOptionPane.QUESTION_MESSAGE
		);
		if (answ==JOptionPane.OK_OPTION) {
			return tFile.getText();			
		} else return null;
	}
	/*public static void showHelpPage(final Component comp, final String text, URL helpURL) {
		if (helpURL!=null)
		try {
			JEditorPane ed=new JEditorPane("text/html",StringUtils.htmlize(ReadText.readText(helpURL.openStream())));
			ed.setEditable(false);
			JScrollPane c=new JScrollPane(ed) {
				public Dimension getPreferredSize() {
					Dimension d=super.getPreferredSize();
					//Dimension m=super.getMinimumSize();
					return new Dimension(d.width>400 ? 400 : d.width,d.height>300 ? 300 : d.height);
				}
			};
				
			//c.setMaximumSize(new Dimension(400,300));
			c.getViewport().scrollRectToVisible(new Rectangle(0,0,1,1)); 
			//c.setMaximumSize(new Dimension(400,300));
			
			JOptionPane.showMessageDialog(comp,new Object[]{text,c},"Aide",JOptionPane.INFORMATION_MESSAGE,IconUtils.fetchIcon("help",64));//,"Qu'est-ce que cette remarque ?",);
		} catch (IOException ex) {
			JDialogs.error(comp,"Erreur de l'aide","Impossible d'afficher la page d'aide...",ex);
		}
	}
	public static void showPage(final Component comp, String title, final String text, URL url,String iconName,int messageType) {
		//if (url!=null)
		try {
			JEditorPane ed=new JEditorPane("text/html",StringUtils.htmlize(ReadText.readText(url.openStream())));
			ed.setEditable(false);
			JScrollPane c=new JScrollPane(ed) {
				public Dimension getPreferredSize() {
					Dimension d=getComponent(0).getPreferredSize();
					return new Dimension(400,300);//d.width<400 ? 400 : d.width,d.height<300 ? 300 : d.height);
					//600,400);//
				}
			};
			c.getViewport().scrollRectToVisible(new Rectangle(0,0,1,1)); 
			
			JOptionPane.showMessageDialog(comp,new Object[]{text,c},title,messageType,IconUtils.fetchIcon(iconName,-1));
		} catch (Exception ex) {
			JDialogs.error(comp,"Erreur","Impossible d'afficher la page '"+url+"'...",ex);
		}
	}*/
}


package com.ochafik.io;
import java.awt.TextArea;
import java.io.OutputStream;
public class TextAreaOutputStream extends OutputStream {
	TextArea ta;
	public TextAreaOutputStream(TextArea t) {
		ta=t;
	}
	public void close() {ta=null;}
	public void write(int i) {
		ta.append(new String(new byte[]{(byte)i}));
	}
	public void write(byte b[]) {
		ta.append(new String(b));
	}
	public void write(byte b[],int s,int l) {
		ta.append(new String(b,s,l));
	}
}
		

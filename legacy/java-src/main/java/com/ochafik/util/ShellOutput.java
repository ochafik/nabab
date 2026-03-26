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

package com.ochafik.util;
import java.io.PrintStream;

import com.ochafik.util.progress.DefaultProgressModel;

public class ShellOutput {
	public static String genBar(char c,int len) {
		StringBuffer b=new StringBuffer(len);
		for (int i=len;--i!=-1;) b.append(c);
		return b.toString();
	}
	static int x=0;
	public static int getPos() {return x;}
	static StringBuffer currentLine=new StringBuffer();
	static PrintStream out=System.out;
	public static void goTo(int newX) {
		if (newX<x) {
			for (int i=newX;i<x;i++) out.print('\b');
			x=newX;
		} else {
			if (newX>x) {
				int len=currentLine.length();
				int i;
				for (i=x;i<newX&&i<len;i++) out.print(currentLine.charAt(i));
				if (i<newX) for (int j=i;j<newX;j++) {
					currentLine.append(' ');
					out.print(' ');
				}
				x=newX;
			}
		}
	}
	public static void print(char c,int len) {
		for (int i=len;--i!=-1;) print(c);
	}
	public static void print(char c) {
		out.print(c);
		int len=currentLine.length();
		if (x==len) currentLine.append(c);
		else currentLine.setCharAt(x,c);
		x++;
	}
	public static void print(Object o) {
		String os=o.toString();
		int i=os.lastIndexOf("\n"),osLength=os.length();
		if (i>=0) {
			currentLine.delete(0,currentLine.length());
			currentLine.append(os.substring(i+1));
			x=(osLength-1)-i;
		} else {
			int len=currentLine.length();
			int dispoLen=len-x;
			if (osLength<=dispoLen) currentLine.replace(x,x+osLength,os);
			else {
				//System.out.println("x="+x);
				//if () currentLine.delete(x,len);
				if (dispoLen>0) {
					currentLine.replace(x,dispoLen,os.substring(0,dispoLen));
					currentLine.append(os.substring(dispoLen));
				} else currentLine.append(os);
			}
			currentLine.replace(x,x+osLength,os);
			x+=os.length(); 
		}
		out.print(os);		
	}
	public static class ShellLabel {
		private int maxLength=-1,labelStart;
		private String lastText;
		public ShellLabel(String s) {
			init(s,getPos(),-1);
		}
		public ShellLabel(String s,int l) {
			init(s,getPos(),l);
		}
		public ShellLabel(String s,int p, int l) {
			init(s,p,l);
		}
		public void moveTo(int i) {
			goTo(labelStart);
			print(' ',lastText.length());
			init(lastText,i,maxLength);
		}
		public void init(String s,int p,int m) {
			labelStart=p;
			maxLength=m;
			if (lastText!=null) {
				goTo(labelStart);
				print(' ',lastText.length());
			}
			if (m>0) {
				goTo(labelStart);
				print(' ',m);
			} 
			
			labelStart=p;
			maxLength=m;
			setText(s);
		}
		public int getLength() {return lastText.length();}
		public void setMaxLength(int m) {
			int ltl=lastText.length();
			if (ltl>m) {
				maxLength=m;
				setText(lastText);
			} else {
				goTo(labelStart+ltl);
				print(' ',m-ltl);	
				maxLength=m;
			}
		}
		public void setText(String s) {
			if (s!=null) {
				if (lastText!=null) {
					goTo(labelStart);
					print(' ',lastText.length());
				}
				lastText=s;
				goTo(labelStart);
				print(s);
			}
		}
		char emptyChar=' ', fullChar='#';
		String title;
		String lastStatus;
		
	}
	public static class ShellBar extends DefaultProgressModel {
		private int lastAmount=0, i, maximum=-1, barStart, barLength;
		char emptyChar=' ', fullChar='#';
		String title;
		String lastStatus;
		ShellLabel shellLabel;
		public void printShellLabel() {
			setShellLabel(new ShellLabel(" 0%",6));
		}
		private void setShellLabel(ShellLabel sl) {
			shellLabel=sl;
			//if (sl!=null) sl.setMaxLength(6);
			int v=i;
			i=0;
			setValue(i);
		}
		public void setTitle(String s) {
			init(barStart,barLength);
			if (title!=null) {
				print(' ',title.length());
				goTo(barStart);
			}
			print(s);
			init(getPos(),barLength);			
		}
		public void setFinalStatus(String s) {}
		public void setComment(String s) {
			goTo(barStart+barLength+2);
			if (lastStatus!=null) {
				print(' ',lastStatus.length());
				goTo(barStart+barLength+2);
			}
			print(s);
		}
		public ShellBar(int len) { 
			init(getPos(),len);
		}
		public ShellBar(int start,int len) { 
			init(start,len);
		}
		public void init(int start, int len) {
			barStart=start;
			barLength=len;
			lastAmount=0;
			i=0;
			maximum=-1;
			goTo(barStart);
			print(emptyChar,barLength);
		}
		public long getMaximum() {return (long)maximum;}
		public void setMaximum(long t) {
			int om=maximum;
			maximum=(int)t;
			if (om==-1&&maximum!=0) redraw(0,(i*barLength)/maximum); 
		}
		public void addValue(long ii) {
			if (ii==0) return;
			else setValue(i+(int)ii);
		}
		public void setValue(long li) {
			int ii=(int)li;
			if (i==ii) return;
			i=ii;
			
			if (maximum==-1) return;//throw new RuntimeException("Maximum non spEcifiE");
			if (maximum!=0) {
				int newAmount=(i*barLength)/maximum;
				int newPercent=(i*100)/maximum;
				if (shellLabel!=null&&newPercent!=lastPercent) redrawPercent(newPercent);
				if (newAmount!=lastAmount) redraw(lastAmount,newAmount);
				else goTo(barStart+newAmount);
			}
		}
		int lastPercent=0;
		void redrawPercent(int newPercent) {
			shellLabel.setText(" "+newPercent+" %");
			lastPercent=newPercent;
		}
		void redraw(int lastAmount,int newAmount) {
			int diff=newAmount-lastAmount;
			char c='#';
			int a=lastAmount;
			if (diff<0) {
				c=' ';
				a=newAmount;
				diff=-diff;
			}
			//if (diff>3) System.out.println("haha "+lastAmount+" -> "+newAmount);
			goTo(barStart+a);
			print(c,diff);
			this.lastAmount=newAmount;
		}
	};
			
			
	/*public static int setBarState(int lastPosition,int i,int total,int barStart, int barLength,char emptyChar, char fullChar) {
		int fullAmount=(i*barLength)/total,nextPosition=barStart+fullAmount;
		if (nextPosition>lastPosition) {
			goTo(lastPosition);
			print(fullChar,nextPosition-lastPosition);
			return nextPosition;
		} else {
			goTo(nextPosition);
			print(empyChar,lastPosition-nextPosition);
			return nextPosition;
		}
	}*/
	public static void clearRestOfLine() {
		int initX=x;
		print(' ',currentLine.length()-x);
		goTo(initX);
	}
	public static void clearCurrentLine() {
		goTo(0);
		clearRestOfLine();
	}
	public static void println(String s) {
		out.println(s);
		currentLine.delete(0,currentLine.length());
		x=0;
	}
	public static void newline() {
		currentLine.delete(0,currentLine.length());
		x=0;
		out.println();
	}
	public static void main(String args[]) {
		int barLen=60;
		char barEmptyChar=' ',barFullChar='#';
		try {
			for (;;) {
			int max=100;
			print('[');
			ShellBar bar=new ShellBar(barLen);
			print(']');
			bar.setMaximum(max);
						
			//print(" Compression");
			print(' ');
			int percentStart=getPos();
			int i=0;
			String percentMask="     ";
			print("  0 %");
			
			print(" Compression");
			for (;i<max;i++) {
				Thread.sleep(10);
				bar.setValue(i);
				goTo(percentStart);
				print(percentMask);
				goTo(percentStart);
				//clearRestOfLine();
				print(i+" %");
			}
			/*Thread.sleep(10);
			for (int i=barLen-1;i>=0;i--) {
				Thread.sleep(10);
				bar.setValue(i);
			}*/
			clearCurrentLine();
			println("Ok");
			}
		} catch (Exception ex) {ex.printStackTrace();}
	}
}

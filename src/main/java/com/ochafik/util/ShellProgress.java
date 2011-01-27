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

package com.ochafik.util;
import java.io.PrintStream;

import com.ochafik.util.progress.AbstractProgressModel;
import com.ochafik.util.progress.ProgressListener;


public class ShellProgress extends AbstractProgressModel {
	long total=-1,currAv=0;
	int currNb=0;
	
	final int shellColumns=ShellUtils.shellColumns;
	final char charAv=ShellUtils.charAv;
	final PrintStream out=ShellUtils.printStream;

	public ShellProgress() {}
	public long getMaximum() {return total;}
	public void setMaximum(long t) {
		if (t>total) fini=false;
		total=t;
	}
	public void addMaximum(long value) {
		setMaximum(getMaximum()+value);
	}
	public String getComment() {
		return null;
	}
	public void addProgress(long l) {setProgress(currAv+=l);}
	public void setProgress(long c) {
		commence=true;
		currAv=c;
		int add=total==0 ? 0 : ((int)((currAv*shellColumns)/total))-currNb;
		for (int i=0;i<add;i++) out.print(charAv);
		currNb+=add;
		if (currNb==shellColumns) {
			//out.println();
			fini=true;
		}
	}
	boolean fini=true,commence=false;
	public void setComment(String s) {
		if (!fini) out.println();
		fini=true;
		ShellUtils.centrerln(s);
		commence=false;
	}
	public long getProgress() {
		return -1;
	}
	public boolean getShowRemainingTime() {
		// TODO Auto-generated method stub
		return false;
	}
	public String getTitle() {
		// TODO Auto-generated method stub
		return null;
	}
	public boolean isIndeterminate() {
		// TODO Auto-generated method stub
		return false;
	}
	public boolean isInterrupted() {
		// TODO Auto-generated method stub
		return false;
	}
	public void setIndeterminate(boolean value) {
		// TODO Auto-generated method stub
		
	}
	public void setInterrupted(boolean value) {
		// TODO Auto-generated method stub
		
	}
	public void setShowRemainingTime(boolean value) {
		// TODO Auto-generated method stub
		
	}
	public void setTitle(String t) {
		// TODO Auto-generated method stub
		
	}
	@Override
	public void addInterruptableThread(Thread thread) {
		// TODO Auto-generated method stub
		super.addInterruptableThread(thread);
	}
	@Override
	public void addProgressListener(ProgressListener listener) {
		// TODO Auto-generated method stub
		super.addProgressListener(listener);
	}
	
	public void setFinalStatus(String s) {
		if (!fini) {fini=true;out.println();}
		
		ShellUtils.centrerln(s);
	}
}
	
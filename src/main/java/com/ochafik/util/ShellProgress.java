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
	
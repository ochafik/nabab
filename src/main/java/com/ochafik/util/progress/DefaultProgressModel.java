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

package com.ochafik.util.progress;
import java.text.MessageFormat;
public class DefaultProgressModel extends AbstractProgressModel {
    final static int SPEED_SAMPLES_SIZE=25;
    long progress,maximum;
    String comment, title;
    boolean indeterminate, interrupted, showRemainingTime;
    
    long initialTime=-1;
    public synchronized void setInitialTime(long time) { initialTime=time; }
    public synchronized boolean isInterrupted() {
        return interrupted;
    }
    public synchronized void setInterrupted(boolean value) {
        if (interrupted!=value) {
            interrupted=value;
            fireProgressUpdated(this,this,ProgressListener.INTERRUPTED_CHANGED);
        }
    }
    public synchronized void setIndeterminate(boolean value) {
        if (indeterminate!=value) {
            indeterminate=value;
            fireProgressUpdated(this,this,ProgressListener.INDETERMINATE_CHANGED);
        }
    }
    public void setShowRemainingTime(boolean value) {
    		if (showRemainingTime!=value) {
    			showRemainingTime=value;
    			fireProgressUpdated(this,this,ProgressListener.SHOWREMAININGTIME_CHANGED);
    		}
    }
    public boolean getShowRemainingTime() {
    		return showRemainingTime;
    }
    public synchronized boolean isIndeterminate() {
        return indeterminate;
    }
    
    public synchronized void setProgress(long value) {
        if (progress!=value) {
            progress=value;
            fireProgressUpdated(this,this,ProgressListener.VALUE_CHANGED | (usesPattern ? ProgressListener.COMMENT_CHANGED : 0));
        }
    }
    public synchronized void addProgress(long value) {
        if (value!=0) {
            progress+=value;
            fireProgressUpdated(this,this,ProgressListener.VALUE_CHANGED | (usesPattern ? ProgressListener.COMMENT_CHANGED : 0));
        }
    }

    public synchronized long getProgress() {
        return progress;
    }

    public synchronized void addMaximum(long value) {
        if (value!=0) {
            maximum+=value;
            fireProgressUpdated(this,this,ProgressListener.MAXIMUM_CHANGED | (usesPattern ? ProgressListener.COMMENT_CHANGED : 0));
        }
    }
    public synchronized void setMaximum(long max) {
        if (maximum!=max) {
            maximum=max;
            fireProgressUpdated(this,this,ProgressListener.MAXIMUM_CHANGED | (usesPattern ? ProgressListener.COMMENT_CHANGED : 0));
        }
    }

    public synchronized long getMaximum() {
        return maximum;
    }

    public synchronized String getTitle() {
        return title;
    }
    public synchronized void setTitle(String t) {
        if ((title==null && t!=null)||!title.equals(t)) {
            title=t;
            fireProgressUpdated(this,this,ProgressListener.TITLE_CHANGED);
        }
    }
    MessageFormat commentPattern;
    boolean usesPattern=false;
    SpeedSamples speedSamples=new SpeedSamples(SPEED_SAMPLES_SIZE);
    public synchronized String getComment() {
        speedSamples.addSample(System.currentTimeMillis(), progress);
        if (usesPattern) {
            String timeString="?";
            if (!indeterminate && showRemainingTime) {
                long remaining=speedSamples.computeTimeRemaining(maximum);
                if (remaining!=-1) {
                    timeString=formatTimeAmount(remaining);
                }
            }
            return commentPattern.format(new Object[] {progress,maximum,timeString},new StringBuffer(),null).toString();
        } else {
            return comment;
        }
        
    }
    public synchronized void setCommentPattern(MessageFormat commentPattern) {
        this.commentPattern=commentPattern;
        usesPattern=comment==null && commentPattern!=null; 
        
    }
    public synchronized void setComment(String t) {
        if ((comment==null && t!=null)||!comment.equals(t)) {
            comment=t;
            usesPattern=comment==null && commentPattern!=null; 
            
            fireProgressUpdated(this,this,ProgressListener.COMMENT_CHANGED);
        }
    }
    static synchronized String formatTimeAmount(long t) {
        StringBuffer b=new StringBuffer();
        if (t>1000) {
            long sec=t/1000;
            if (sec>60) {
                long min=sec/60;
                if (min>60) {
                    long hour=min/60;
                    b.append(hour);
                    b.append(hour>1 ? " hours " : " hour ");
                    long c=hour*60;
                    min-=c;
                    sec-=c*60;
                }
                if (min>0) {
                    b.append(min);
                    b.append(min>1 ? " minutes " : " minute ");
                    long c=min*60;
                    sec-=c;
                }                   
            }
            if (sec>0) {
                b.append(sec);
                b.append(sec>1 ? " seconds " : " second ");         
            }
        } else b.append(t+" milliseconds");
        return b.toString();
    }
    static class SpeedSamples {
        long[] times;
        long[] amounts;
        int nextIndex=0;
        int size;
        int totalSamples=0;
        public SpeedSamples(int size) {
            times=new long[size];
            amounts=new long[size];
            this.size=size;
        }
        public void addSample(long time, long amount) {
            times[nextIndex]=time;
            amounts[nextIndex]=amount;
            nextIndex=(nextIndex+1)%size;
            totalSamples++;
        }
        public float getSpeed() {
            float speedTotal=0;
            int size=this.size;
            long[] times=this.times;
            long[] amounts=this.amounts;
            int nSpeeds=0;
            for (int i=1;i<size&&i<totalSamples;i++) {
                int iMinusOne=i-1;
                long dTime=times[i]-times[iMinusOne];
                long dAmount=amounts[i]-amounts[iMinusOne];
                if (dTime>0) {
                    nSpeeds++;
                    speedTotal+=((float)dAmount)/((float)dTime);
                }
            }
            if (nSpeeds==0) return -1;
            return speedTotal/(float)nSpeeds;
        }
        public int computeTimeRemaining(long maxAmount) {
            long lastAmount=amounts[(nextIndex+size-1)%size];
            
            if (maxAmount==0) return -1;
            float speed=getSpeed();
            if (speed==-1) return -1;
            return (int)(((float)(maxAmount-lastAmount))/speed);
        }
    }
}

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

package com.ochafik.util.progress;

public interface ProgressModel {
    public void setIndeterminate(boolean value);
    public boolean isIndeterminate();
    public void addProgress(long value);
    public void setProgress(long value);
    public long getProgress();
    public void addMaximum(long value);
    public void setMaximum(long max);
    public long getMaximum();
    public String getTitle();
    public String getComment();
    public void setTitle(String t);
    public void setComment(String t);
    public void setShowRemainingTime(boolean value);
    public boolean getShowRemainingTime();

    public boolean isInterrupted();
    public void setInterrupted(boolean value);
}

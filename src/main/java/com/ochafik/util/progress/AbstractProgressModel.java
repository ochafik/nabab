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
import java.util.ArrayList;
import java.util.Collection;
public abstract class AbstractProgressModel implements ProgressModel {
    private Collection<ProgressListener> progressListeners;
    private Collection<Thread> interruptableThreads;
    
    public void addInterruptableThread(Thread thread) {
        if (interruptableThreads==null) {
            interruptableThreads=new ArrayList<Thread>();
        }
        interruptableThreads.add(thread);
    }
    public void addProgressListener(ProgressListener listener) {
        if (progressListeners==null) {
            progressListeners=new ArrayList<ProgressListener>();
        }
        progressListeners.add(listener);
    }
    public void removeProgressListener(ProgressListener listener) {
        if (progressListeners!=null) {
            progressListeners.remove(listener);
        }
    }
    protected void fireProgressUpdated(Object source, ProgressModel model, int eventType) {
        if (progressListeners!=null) {
            for (ProgressListener listener : progressListeners) {
                listener.progressUpdated(source, model, eventType);
            }
        }
    }
}

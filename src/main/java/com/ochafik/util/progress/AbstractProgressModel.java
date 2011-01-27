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

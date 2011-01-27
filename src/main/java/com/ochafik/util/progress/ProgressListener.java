package com.ochafik.util.progress;

public interface ProgressListener {
    public static final int 
        VALUE_CHANGED=1,
        TITLE_CHANGED=2, 
        COMMENT_CHANGED=4, 
        MAXIMUM_CHANGED=8,
        INDETERMINATE_CHANGED=16,
        INTERRUPTED_CHANGED=32,
        SHOWREMAININGTIME_CHANGED=64;
    public void progressUpdated(Object source, ProgressModel model, int eventType);
}

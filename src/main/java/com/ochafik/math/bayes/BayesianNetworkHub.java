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

package com.ochafik.math.bayes;

import java.beans.PropertyChangeListener;
import java.beans.PropertyChangeSupport;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;


import com.ochafik.math.functions.Variable;
import com.ochafik.util.listenable.CollectionEvent;
import com.ochafik.util.listenable.CollectionListener;
import com.ochafik.util.listenable.ListenableSet;


public class BayesianNetworkHub {
	public static final String PROPERTY_NET = "bayesianNet";
	BayesianNetwork bayesianNet;
	
	public enum ListenerType {
		VARIABLES_LISTENER,
		INFERRED_VARIABLES_LISTENER,
		DEFINED_VARIABLES_LISTENER,
		OBSERVED_VARIABLES_LISTENER,
		UNIVERSAL_LISTENER
	};
	Map<ListenerType, Set<CollectionListener<Variable>>> allListeners = new HashMap<ListenerType, Set<CollectionListener<Variable>>>();
	PropertyChangeSupport propertyChangeSupport = new PropertyChangeSupport(this);
	public void addPropertyChangeListener(PropertyChangeListener listener) {
		propertyChangeSupport.addPropertyChangeListener(listener);
	}
	public void removePropertyChangeListener(PropertyChangeListener listener) {
		propertyChangeSupport.removePropertyChangeListener(listener);
	}
	
	public void addListener(ListenerType listenerType, CollectionListener<Variable> listener) {
		Set<CollectionListener<Variable>> listeners = allListeners.get(listenerType);
		if (listeners == null) {
			listeners = new HashSet<CollectionListener<Variable>>();
			allListeners.put(listenerType, listeners);
		}
		listeners.add(listener);
	}
	public void removeListener(ListenerType listenerType, CollectionListener<Variable> listener) {
		Set<CollectionListener<Variable>> listeners = allListeners.get(listenerType);
		if (listeners != null) {
			listeners.remove(listener);
		}
	}
	void installListenersFor(ListenableSet<Variable> col, Set<CollectionListener<Variable>> listeners) {
		CollectionEvent<Variable> event = new CollectionEvent<Variable>(col, col, CollectionEvent.EventType.ADDED);
		for (CollectionListener<Variable> listener : listeners) {
			col.addCollectionListener(listener);
			listener.collectionChanged(event);
		}
	}
	void uninstallListenersFor(ListenableSet<Variable> col, Set<CollectionListener<Variable>> listeners) {
		CollectionEvent<Variable> event = new CollectionEvent<Variable>(col, col, CollectionEvent.EventType.REMOVED);
		for (CollectionListener<Variable> listener : listeners) {
			listener.collectionChanged(event);
			col.removeCollectionListener(listener);
		}
	}
	void installListeners() {
		for (Map.Entry<ListenerType, Set<CollectionListener<Variable>>> e : allListeners.entrySet()) {
			switch (e.getKey()) {
			case DEFINED_VARIABLES_LISTENER:
				installListenersFor(bayesianNet.getDefinitions().keySet(), e.getValue());
				break;
			case INFERRED_VARIABLES_LISTENER:
				installListenersFor(bayesianNet.getInferences().keySet(), e.getValue());
				break;
			case OBSERVED_VARIABLES_LISTENER:
				installListenersFor(bayesianNet.getObservations().keySet(), e.getValue());
				break;
			case VARIABLES_LISTENER:
				installListenersFor(bayesianNet.getVariables(), e.getValue());
				break;
			case UNIVERSAL_LISTENER:
				installListenersFor(bayesianNet.getDefinitions().keySet(), e.getValue());
				installListenersFor(bayesianNet.getInferences().keySet(), e.getValue());
				installListenersFor(bayesianNet.getObservations().keySet(), e.getValue());
				installListenersFor(bayesianNet.getVariables(), e.getValue());
				break;
			}
		}
	}
	void uninstallListeners() {
		for (Map.Entry<ListenerType, Set<CollectionListener<Variable>>> e : allListeners.entrySet()) {
			switch (e.getKey()) {
			case DEFINED_VARIABLES_LISTENER:
				uninstallListenersFor(bayesianNet.getDefinitions().keySet(), e.getValue());
				break;
			case INFERRED_VARIABLES_LISTENER:
				uninstallListenersFor(bayesianNet.getInferences().keySet(), e.getValue());
				break;
			case OBSERVED_VARIABLES_LISTENER:
				uninstallListenersFor(bayesianNet.getObservations().keySet(), e.getValue());
				break;
			case VARIABLES_LISTENER:
				uninstallListenersFor(bayesianNet.getVariables(), e.getValue());
				break;
			case UNIVERSAL_LISTENER:
				uninstallListenersFor(bayesianNet.getDefinitions().keySet(), e.getValue());
				uninstallListenersFor(bayesianNet.getInferences().keySet(), e.getValue());
				uninstallListenersFor(bayesianNet.getObservations().keySet(), e.getValue());
				uninstallListenersFor(bayesianNet.getVariables(), e.getValue());
				break;
			}
		}
	}
	public void setBayesianNet(BayesianNetwork bayesianNet) {
		BayesianNetwork oldNet = this.bayesianNet;
		if (oldNet != null) {
			uninstallListeners();
		}
		this.bayesianNet = bayesianNet;
		installListeners();
		propertyChangeSupport.firePropertyChange(PROPERTY_NET, oldNet, bayesianNet);
	}
	public BayesianNetwork getBayesianNet() {
		return bayesianNet;
	}
}

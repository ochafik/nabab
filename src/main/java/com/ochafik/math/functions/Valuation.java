package com.ochafik.math.functions;

import java.util.Collection;

import com.ochafik.util.listenable.Pair;

public interface Valuation<N extends Variable> { //extends Iterable<Pair<N, Integer>> {

	public abstract void put(N var, int val);
	public abstract int get(N var);
	public abstract boolean remove(N var);
	
	public abstract boolean hasVariable(N v);
	public abstract boolean containsAll(Collection<N> vv);
	
	public abstract int indexOf(N v);
	//public abstract int size();
	public abstract N getVariableAt(int i);
	public abstract int getValueAt(int i);
	public abstract void setValueAt(int i, int v);		
	
	public abstract Valuation<N> deriveNewValuation();
}
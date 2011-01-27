package com.ochafik.math.functions;

import java.util.Collection;
import java.util.NoSuchElementException;

public class ChainedFastFatValuation<N extends Variable> extends FastFatValuation<N> {
	FastFatValuation<N> parent;
	
	public ChainedFastFatValuation(FastFatValuation<N> parent) {
		super(parent.values.length);
		this.parent = parent;
	}
	
	@Override
	public int get(N var) {
		if (super.hasVariable(var))
			return super.get(var);
		return parent.get(var);
	}

	@Override
	public int getValueAt(int i) {
		if (super.getVariableAt(i) != null)
			return super.getValueAt(i);
		
		return parent.getValueAt(i);
	}

	@Override
	public N getVariableAt(int i) {
		N variable = super.getVariableAt(i);
		return variable == null ? parent.getVariableAt(i) : variable;
	}

	@Override
	public boolean hasVariable(N v) {
		return super.hasVariable(v) || parent.hasVariable(v);
	}

	@Override
	public int indexOf(N v) {
		int i = super.indexOf(v);
		return i < 0 ? parent.indexOf(v) : i;
	}
	
}

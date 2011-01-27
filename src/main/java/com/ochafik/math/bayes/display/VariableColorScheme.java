package com.ochafik.math.bayes.display;

import java.awt.Color;

public class VariableColorScheme {
	Color mainColor, secondaryColor;

	public VariableColorScheme(Color mainColor, Color secondaryColor) {
		this.mainColor = mainColor;
		this.secondaryColor = secondaryColor;
	}
	
	
	public Color getMainColor() {
		return mainColor;
	}
	public Color getSecondaryColor() {
		return secondaryColor;
	}
}

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

package com.ochafik.math.graph;

import com.ochafik.math.graph.impl.FastDenseIntEdgeSet;
import com.ochafik.math.graph.impl.FastDenseValuedEdgeSet;
import com.ochafik.math.graph.impl.FastSparseBinaryEdgeSet;
import com.ochafik.util.IntArray;
import com.ochafik.util.IntArrayUtils;
import com.ochafik.util.IntPairSet;
import com.ochafik.util.ShellOutput;

public class ConnectivityUtils {
	public static final BinaryEdgeSet computeGlobalConnectivity(final EdgeSet localConnectivity) {
		final BinaryEdgeSet globalConnectivity = new FastSparseBinaryEdgeSet(localConnectivity.isOriented());
		//final BinaryEdgeSet globalConnectivity = new DefaultBinaryEdgeSet(localConnectivity.isOriented());
		localConnectivity.export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				updateGlobalConnectivityWithNewEdge(globalConnectivity, x, y);
			}
		});

		return globalConnectivity;
	}

	public static final void updateGlobalConnectivityWithNewEdge(BinaryEdgeSet globalConnectivity, int x, int y) {
		IntArray ancestors = globalConnectivity.getStarts(x), descendents = globalConnectivity.getEnds(y);
		globalConnectivity.set(ancestors, descendents);
		globalConnectivity.set(ancestors, IntArrayUtils.wrap(y));
		globalConnectivity.set(IntArrayUtils.wrap(x), descendents);
		globalConnectivity.set(x, y);
	}
	public static final void updatePathLengthGlobalConnectivityWithNewEdge(IntEdgeSet  globalConnectivity, int x, int y) {
		int[] arrayInt1 = new int[1];
		
		IntArray starts = globalConnectivity.getStarts(x), ends = globalConnectivity.getEnds(y);
		for (int iStart = starts.size(); iStart-- != 0;) {
			int start = starts.get(iStart);
			
			int startPathLength = globalConnectivity.get(start, x, arrayInt1) ? arrayInt1[0] : 0;

			for (int iEnd = ends.size(); iEnd-- != 0;) {
				int end = ends.get(iEnd);
				//len = globalConnectivity.get(y, end);
				int endPathLength = globalConnectivity.get(y, end);//len == null ? 0 : len.intValue();

				int combinedLength = startPathLength + 1 + endPathLength;
				if (!globalConnectivity.get(start, end, arrayInt1) || combinedLength < arrayInt1[0]) {
					globalConnectivity.set(start, end, combinedLength);
				}
			}

			int combinedLength = startPathLength + 1;
			if (!globalConnectivity.get(start, y, arrayInt1) || combinedLength < arrayInt1[0]) {
				globalConnectivity.set(start, y, combinedLength);
			}

		}

		for (int iEnd = ends.size(); iEnd-- != 0;) {
			int end = ends.get(iEnd);
			//Integer len = globalConnectivity.get(y, end);
			int endPathLength = globalConnectivity.get(y, end);//len == null ? 0 : len.intValue();

			int combinedLength = 1 + endPathLength;
			if (!globalConnectivity.get(x, end, arrayInt1) || combinedLength < arrayInt1[0]) {
				globalConnectivity.set(x, end, combinedLength);
			}
		}

		globalConnectivity.set(x, y, 1);

	}
	public static final IntEdgeSet computePathLengthGlobalConnectivity(final EdgeSet localConnectivity, int nodeCount) {
		final IntEdgeSet globalConnectivity = new FastDenseIntEdgeSet(localConnectivity.isOriented(), nodeCount);
		final ShellOutput.ShellLabel lab = new ShellOutput.ShellLabel("");
		final int total = localConnectivity.size();
		final int n[] = new int[] {0};
		long startTime = System.nanoTime();
		localConnectivity.export(new IntPairSet.IntPairOutput() {
			public void output(int x, int y) {
				updatePathLengthGlobalConnectivityWithNewEdge(globalConnectivity, x, y);
				if ((n[0] & 63) == 0) lab.setText(n[0]+" / "+total);
				n[0]++;
			}
		});
		lab.setText("");
		long endTime = System.nanoTime();
		lab.setText(((endTime - startTime) / 1000000) + " ms (" + (((endTime - startTime) / 100000 / n[0]) / 10.0) + " ms each)");
		ShellOutput.newline();
		return globalConnectivity;
	}
}

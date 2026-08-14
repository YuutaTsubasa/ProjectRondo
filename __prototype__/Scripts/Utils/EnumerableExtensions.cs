using System;
using System.Collections.Immutable;
using System.Runtime.InteropServices;
using ZLinq;

namespace ProjectRondo.Utils;

/// <summary>ZLinq bridges that let call sites express iteration with LINQ instead of manual loops.</summary>
public static class EnumerableExtensions
{
	/// <summary>Applies <paramref name="action"/> to every element, preferring span iteration when available.</summary>
	public static void ForEach<TEnumerator, TSource>(this ValueEnumerable<TEnumerator, TSource> source, Action<TSource> action)
		where TEnumerator : struct, IValueEnumerator<TSource>
#if NET9_0_OR_GREATER
		, allows ref struct
#endif
	{
		using var e = source.Enumerator;

		if (e.TryGetSpan(out var span))
		{
			foreach (var item in span)
			{
				action(item);
			}
		}
		else
		{
			while (e.TryGetNext(out var item))
			{
				action(item);
			}
		}
	}

	/// <summary>Materialises the sequence into an <see cref="ImmutableArray{T}"/> with as few copies as possible.</summary>
	public static ImmutableArray<T> ToImmutableArray<TEnumerator, T>(this ValueEnumerable<TEnumerator, T> source)
		where TEnumerator : struct, IValueEnumerator<T>
#if NET9_0_OR_GREATER
		, allows ref struct
#endif
	{
		using var e = source.Enumerator;

		if (e.TryGetSpan(out var span))
		{
			return ImmutableArray.Create(span);
		}

		if (!e.TryGetNonEnumeratedCount(out var count))
		{
			var builder = ImmutableArray.CreateBuilder<T>();
			while (e.TryGetNext(out var current))
			{
				builder.Add(current);
			}
			return builder.ToImmutable();
		}

		var array = GC.AllocateUninitializedArray<T>(count);
		if (e.TryCopyTo(array, offset: 0))
		{
			return ImmutableCollectionsMarshal.AsImmutableArray(array);
		}

		var index = 0;
		while (e.TryGetNext(out var current))
		{
			array[index] = current;
			index++;
		}
		return ImmutableCollectionsMarshal.AsImmutableArray(array);
	}
}

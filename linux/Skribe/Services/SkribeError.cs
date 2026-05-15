using System;

namespace Skribe.Services;

public sealed class SkribeException : Exception
{
    public SkribeException(string message) : base(message) { }
    public SkribeException(string message, Exception inner) : base(message, inner) { }
}

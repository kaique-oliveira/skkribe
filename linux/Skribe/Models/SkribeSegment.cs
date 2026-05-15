namespace Skribe.Models;

public sealed record SkribeSegment(double Start, double End, string Speaker, string Text)
{
    public string FormattedStart => Format(Start);
    public string FormattedEnd => Format(End);

    private static string Format(double seconds)
    {
        var total = (int)seconds;
        var m = total / 60;
        var s = total % 60;
        return $"{m:D2}:{s:D2}";
    }
}
